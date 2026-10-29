# API testing

## Prisma migration baseline

The active migration history preserves the original migrations used by
existing deployments and extends them only with forward migrations. The
replacement `20261012000000_initial_baseline` is retained under
`prisma/retired-experimental-migrations/20261012/` because applying that
fresh-schema baseline to a database with the original history would be unsafe.

The repository contains 62 active migrations, with
`20261025000000_kitchen_priority_and_wait_policy` as the latest migration. The
dedicated test database (`cafe_os_order_lifecycle_test`) has all 62 migrations;
Prisma migration status and database-to-datamodel drift checks passed after
applying the Kitchen migration. A full backup of that test database was
restored to an isolated PostgreSQL 18 rehearsal database; the restored
database also passed migration-status and schema-drift checks. The production
database target is `cafe_os`, but its current migration and schema status are
unknown. No connection to or change of that production database was made.
Historical records that showed `cafe_os` up to date covered only the
then-current 60-migration history. Migration status verifies history, not a
schema-diff comparison.
CI applies the complete active history and checks for drift. A prior backup
and restore rehearsal applied the then-pending six migrations to an isolated
PostgreSQL 18 clone and reported no schema diff; that historical rehearsal
covered the then-current 50-migration history. The later test-database
backup/restore rehearsal covered the current 62-migration schema; neither
rehearsal verifies production `cafe_os` or constitutes rollout approval.

Do not infer production rollout approval or post-deployment health from a
local migration-status result. Before a production deployment, review every
pending SQL migration, require an approved backup and restore procedure, run
`prisma migrate deploy` only through the approved release job, and verify
application health and schema state afterward.

## Local tenant invitations

Invitation setup links use `WEB_BASE_URL`. When the local web app runs on port
`3001`, set `WEB_BASE_URL=http://localhost:3001` in `apps/api/.env`; otherwise
the default points to port `3000`. For local invitation testing, route SMTP to
Mailpit at `127.0.0.1:1025` and use a reserved `.test` recipient address.

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
