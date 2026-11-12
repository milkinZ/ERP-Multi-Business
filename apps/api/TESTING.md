# API testing

## Prisma migration baseline

The active migration history preserves the original migrations used by
existing deployments and extends them only with forward migrations. The
replacement `20261012000000_initial_baseline` is retained under
`prisma/retired-experimental-migrations/20261012/` because applying that
fresh-schema baseline to a database with the original history would be unsafe.

The repository currently contains 80 active migrations. On 2026-11-04, the
local `cafe_os` database at `127.0.0.1:5432` was explicitly reset and all 71
migrations present at that time were applied. That historical local result
does not establish the current database migration status, production
deployment, or schema drift. Earlier rehearsal notes in this document refer
to older migration counts and are historical. Migration status verifies
migration history, not a schema-diff comparison.

Do not infer production rollout approval or post-deployment health from a
local migration-status result. Before a production deployment, review every
pending SQL migration, require an approved backup and restore procedure, run
`prisma migrate deploy` only through the approved release job, and verify
application health and schema state afterward.

## Local demo tenant seed

The local demo seed refuses to run outside a non-production `cafe_os` database
on loopback. From `apps/api`, run
`npx ts-node --project tsconfig.json prisma/seed.ts`. It creates or updates the
demo tenant, a tenant administrator with all tenant permissions, and sample
outlet, warehouse, inventory items, products, supplier offers, recipe, kitchen
station, tax rules, and accounting setup. A randomly generated tenant password
is printed only when the administrator is first created. It does not create
opening inventory movements or platform identities; platform administrators
must be provisioned through the local OIDC/WebAuthn setup or the deployment's
approved identity-provider workflow.

## Local tenant invitations

Invitation setup links use `WEB_BASE_URL`. When the local web app runs on port
`3001`, set `WEB_BASE_URL=http://localhost:3001` in `apps/api/.env`; otherwise
the default points to port `3000`. For local invitation testing, route SMTP to
Mailpit at `127.0.0.1:1025` and use a reserved `.test` recipient address.

## Self-service tenant registration

The public registration page lists non-deleted plans from
`GET /auth/tenant-registration/plans` and submits the business name, Owner
email, plan, business type, and currency to `POST /auth/register`. The API
creates a suspended tenant and inactive subscription, then sends a single-use
verification invitation explicitly marked as self-registration. The Owner sets a
password through that link; only after the
invitation is accepted does the API activate the tenant and subscription and
create the initial invoice. Duplicate addresses receive the same generic
response as a new registration.

For local testing, keep `WEB_BASE_URL` pointed at the web app (for example
`http://localhost:3001`) and run SMTP locally through Mailpit. The registration
email can then be opened from the Mailpit inbox; no public HTTPS tunnel is
needed for the verification link.

## Plan modules and usage limits

The platform-managed module catalog contains `INVENTORY`, `PROCUREMENT`,
`FINANCE`, and `ANALYTICS`. The default plan matrix is:

| Plan       | Included modules                           |
| ---------- | ------------------------------------------ |
| FREE       | None                                       |
| STARTER    | INVENTORY                                  |
| BUSINESS   | INVENTORY, PROCUREMENT, ANALYTICS          |
| ENTERPRISE | INVENTORY, PROCUREMENT, FINANCE, ANALYTICS |

Migrations assign this matrix to existing plans. New plans receive the same
defaults when module IDs are omitted; platform operators can customize
assignments from the Plans page. Unassigned or inactive modules are denied.
Tenant-level feature flags can disable an entitled module but cannot grant
access to a module that the plan does not include. Inventory, ingredients,
recipes, and warehouses use `INVENTORY`; suppliers and purchase orders use
`PROCUREMENT`; accounting and supplier accounts payable use `FINANCE`;
analytics endpoints use `ANALYTICS`. Core orders, products, payments, outlets,
and Owner access are not gated by these module assignments.

Monthly order limits are hard caps on creating new orders. The usage counter is
updated in the order transaction, so a rejected order does not persist or count
as usage, including when concurrent requests race for the final slot. Reading
or completing existing orders remains available. A `null` monthly order limit
means unlimited.

## Platform identity sign-in

Platform administrators use a separate OIDC identity boundary and do not sign
in with tenant credentials. Production must set all of
`PLATFORM_OIDC_ISSUER`, `PLATFORM_OIDC_CLIENT_ID`,
`PLATFORM_OIDC_CLIENT_SECRET`, `PLATFORM_OIDC_CALLBACK_URL`,
`PLATFORM_OIDC_FRONTEND_CALLBACK_URL`, `PLATFORM_OIDC_STATE_HMAC_SECRET`, and
`PLATFORM_OIDC_ALLOWED_ACR_VALUES`. Issuer and callback URLs must use HTTPS in
production. Keep the client secret and HMAC key in the deployment secret
manager; the HMAC key must be at least 32 characters and must be distinct from
the JWT secret. Production configuration validation rejects reuse of the JWT
secret as the OIDC state key.

Configure the identity provider to enforce MFA and return an `acr` ID-token
claim corresponding to that completed MFA. The comma-separated
`PLATFORM_OIDC_ALLOWED_ACR_VALUES` list must contain only the exact assurance
values approved for that provider. The API requests those values and rejects
missing or unapproved `acr` claims. It never auto-provisions an OIDC subject:
an operator must provision the exact issuer/subject pair in
`PlatformIdentity` and assign one of `READ_ONLY`, `OPERATIONS`, or
`PLATFORM_ADMIN`. The platform session is an HttpOnly opaque cookie with a
four-hour absolute lifetime; it is not extended by access-token renewal.
Platform access JWTs are short-lived and are revalidated against the active
database session on every request.

Keycloak is the approved production identity provider. Production issuer
configuration must use the HTTPS Keycloak realm issuer URL
(`https://<host>/realms/<realm>`; a reverse-proxy path prefix is allowed).
The exact host, realm, MFA `acr` values, initial platform identities, and
secret-manager values are deployment configuration and have not been assumed
or verified here. Require phishing-resistant FIDO2/WebAuthn MFA and configure
the approved exact assurance values. Before enabling the platform console,
provision the named platform identities and verify a real authorization-code
sign-in and logout. Unit tests prove configuration and policy checks but do
not prove the deployment's Keycloak realm, MFA policy, or live sign-in.
Never put client secrets or the state HMAC key in this document or in source
control.

No production ACR contract is configured. Proposed project ACR identifier:
`urn:erp-multi-business:acr:phishing-resistant-webauthn`. This is a candidate
contract, not a verified Keycloak claim. Before adding it to
`PLATFORM_OIDC_ALLOWED_ACR_VALUES`, configure the production Keycloak client and
authentication flow so that this exact ACR is issued only after successful
FIDO2/WebAuthn with user verification, with no weaker fallback; then verify it
in a signature-validated ID token from a real sign-in.

The development realm is reproducibly configured by
`docker-compose.keycloak.local.yml` and
`src/modules/auth/platform-keycloak.local-realm.json`. It binds only to
loopback, enables Keycloak's step-up authentication feature, requires
WebAuthn with user verification, and maps the development ACR candidate to
LoA 2. Run `scripts/setup-keycloak-local.ps1` to provision the confidential
PKCE client and an active `READ_ONLY` test identity in the local `cafe_os`
database; generated credentials stay in the Git-ignored
`.env.keycloak.local`. Run `scripts/test-keycloak-local.ps1` to check live
discovery and the active WebAuthn/LoA policy.
Production uses a separate HTTPS issuer and independently approved MFA ACR;
the local HTTP issuer must never be copied into production configuration.

The persistent Compose realm has been exercised end to end through the UI:
Keycloak required passkey enrollment and passkey login; the API validated the
signed token, issuer, state, nonce, PKCE, and development ACR; and the browser
callback restored an active platform session with role `READ_ONLY` before
redirecting to `/platform/dashboard`. The dashboard loaded its platform
aggregates and reported database, Redis, and BullMQ readiness. UI logout
returned to `/platform/login`; a prior API-level check confirmed CSRF-protected
logout revokes the session and the next session request returns 401. These
results verify only local development and do not establish production
assurance.

Configure `DATABASE_URL` privately. Production startup requires PostgreSQL
and the database name `cafe_os`; test deployments must continue to use a
dedicated database ending in `_test`. Use the active migration history for
fresh and existing databases. Future schema changes must use incremental
migrations; do not regenerate the historical chain or edit applied migration
files.

Unit tests run without PostgreSQL, Redis, queues, or network services. They
exercise domain/application behavior with explicit mocks and deterministic
fixtures. They must not silently become integration tests.

Integration tests use the `.int-spec.ts` suffix and may connect to real
PostgreSQL and Redis. E2E tests use the `.e2e-spec.ts` suffix and exercise the
Nest application through HTTP. Keep infrastructure assertions in integration
tests and public-interface assertions in E2E tests.

## Order, kitchen, and inventory lifecycle

Regular orders are released to the cafe kitchen only after full payment.
Open-bill orders can be released before payment and accept partial payments;
payment completion is tracked separately from the order's kitchen/fulfillment
status. Active stock reservations are released when an order is cancelled,
committed when cafe preparation starts, and committed at retail fulfillment.
Costing is applied on commit, not when a reservation is first created.

Integration and E2E suites require an explicitly configured PostgreSQL database whose name ends in `_test` and a Redis URL using a non-zero database. Copy `.env.test.example` into CI configuration; never use these settings in `.env`.

The platform tenant provisioning integration suite verifies the atomic tenant,
Owner-role invitation, paid subscription, and audit-log transaction, plus
initial invoice generation and concurrent owner-email protection. Invitation
delivery is mocked; no Xendit payment request is sent.

Autopay token encryption requires `XENDIT_TOKEN_ENCRYPTION_KEYS` and
`XENDIT_TOKEN_ENCRYPTION_ACTIVE_KEY_VERSION` in the API deployment's secret
manager. The key-ring variable is a JSON object mapping version names to
base64-encoded 32-byte AES keys; keep prior versions available while stored
tokens still reference them. Generate keys with a cryptographically secure
random generator, use separate keys per environment, and never commit or log
key values. When Autopay is enabled but encryption is missing or invalid, the
API reports the integration as unavailable and rejects enrollment before
creating an enrollment or contacting Xendit.

Autopay enrollment uses Xendit's hosted Payment Session (`POST /sessions`) with
a forced save choice and the `CARDS` channel; card details are entered only on
Xendit's hosted checkout. Xendit requires HTTPS return URLs, so set
`XENDIT_RETURN_BASE_URL` to the public HTTPS origin where the browser should
return after checkout. If omitted, the API falls back to `WEB_BASE_URL` and
rejects enrollment when that URL is HTTP; local Xendit testing therefore needs
an HTTPS tunnel configured as `XENDIT_RETURN_BASE_URL`, while local invitation
links can continue using `WEB_BASE_URL=http://localhost:3001`. Configure the
Xendit webhook to deliver
`payment_session.completed` and `payment_session.expired` to
`/webhooks/payments`, alongside `payment.capture` and `payment.failure`.
`payment_token.activation` may also be enabled as a redundant token event.
See Xendit's [Payment Sessions API](https://docs.xendit.co/apidocs/create-session),
[Pay and Save guide](https://docs.xendit.co/docs/pay-and-save), and
[Payments API webhook reference](https://docs.xendit.co/docs/payments-api-webhooks).

Test bootstrap refuses non-test environments, non-`*_test` databases, and Redis database `0`. Apply migrations before integration or E2E tests:

```powershell
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
npm run test:integration -w apps/api -- --runInBand
npm run test:e2e -w apps/api -- --runInBand
```

The Jest E2E profile allows 30 seconds for each test and setup hook to
accommodate full Nest application bootstrap. E2E assertions should match the
current public response shape; paginated collection endpoints return
`{ data, pagination }`.

The API CI workflow provisions disposable PostgreSQL and Redis services, applies
the complete active migration history, verifies migration status, compares the
migrated schema to the Prisma datamodel, and runs API unit/integration/E2E plus
workspace build, non-mutating lint, and typecheck gates. The tenant-isolation E2E suite includes cross-tenant
user/role/outlet assignment and cross-user notification ownership regressions;
the telemetry contract also verifies the `super-admin.read` authorization
boundary.

For a non-test deployment, review the target's migration status and every
pending SQL migration before rollout. Require a verified backup and restore
procedure, run `prisma migrate deploy` only through the approved release job,
and verify application health and schema state afterward. Stop if migration
history diverges or the target's baseline is unknown; do not use
`migrate resolve`, reset, or manual history edits as a shortcut. Disposable
database success does not establish production backup/restore or deployment
readiness.

The default unit suite currently has no global coverage threshold because the
repository still contains uncovered production modules. Coverage output is
still generated by `npm run test:coverage -w apps/api`; the threshold must be
raised only as critical modules gain meaningful behavioral coverage.
