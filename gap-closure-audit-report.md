# Gap Closure Audit Report

## Executive summary

**Documentation synchronization: current implementation snapshot.** The master register is the status source of truth; the priority matrix and module registers now use consistent status classifications for the reviewed gaps.

**Status: IN PROGRESS — not production-ready.** Tenant/platform permission boundaries have been reviewed and tightened: orders, tenant metadata, and tenant audit-log reads now require explicit permissions; tenant permissions are explicitly classified and fail closed; direct tenant creation through the authenticated tenant API is removed. A separate platform OIDC/MFA sign-in boundary is implemented, but production provider configuration and a live IdP verification remain outstanding.

Open production gates remain: exact provider issuer/`acr` and live platform sign-in, explicit rollout approval and post-deployment checks, remaining financial/platform/browser E2E coverage, and unresolved billing/operational contracts. The SEC-003 implementation and tenant-isolation regressions pass; these do not substitute for release-specific verification. Safe settings exclude deployment secrets; other unimplemented functionality is not represented as complete.

## Implemented and verified

### Subscription lifecycle and outbox

- Tenant plan catalog and bounded tenant plan-change, suspend, resume, and cancel actions are tenant-scoped.
- Subscription persistence and outbox insertion share a transaction; aggregate events are drained only after persistence succeeds.
- Tenant and platform plan changes are scheduled for the next renewal. Pending-plan state and scheduling outbox events are persisted atomically; platform scheduling also persists its audit record in the same transaction.
- Renewal applies the pending plan before recording the effective plan-change and renewal events and before generating the invoice at the new plan price. No proration is charged.
- Renewal period ends are persisted to make repeated renewal requests idempotent. Billing invoices use a unique subscription/month key, and invoice creation plus required outbox events commit atomically.
- Subscription plan changes record durable history with event type, actor, timestamp, and sanitized metadata; tenant history reads are permission-protected and tenant-scoped.
- Subscription unit coverage validates history reads and persistence behavior. Its earlier migration-status check for `cafe_os_order_lifecycle_test` covered the then-current 60 active migrations; the database was later verified through 61 migrations, before the latest Kitchen migration. A focused PostgreSQL rerun for subscription-history persistence after its migration is still outstanding.
- Proration is explicitly not applied to plan changes. Payment rules beyond existing billing flows remain outside the approved contract.

### Worker and job visibility

- Worker identity/heartbeat and job attempt history are exposed through authorized, bounded platform reads.
- Workers displays heartbeat and safe job-attempt metadata; raw payloads, error text, correlation identifiers, and BullMQ job IDs are not part of the UI contract.
- Worker retry-series PostgreSQL/Redis integration: 1 suite, 2 tests passed.
- Scheduler execution history, retention, alerting, DLQ, and mutating job controls remain undefined and unavailable.

### Inventory concurrency

- PostgreSQL tests cover two orders competing for 10 units with 7 requested each, concurrent same-order fulfillment, duplicate reservation/release, and concurrent expiry.
- Fulfillment and reservation integration suites: 2 suites, 10 tests passed.
- Unit tests exercise the tenant-scoped order lock and idempotent claim behavior.

### Platform dashboard

- Dashboard consumes authoritative tenant, subscription, invoice, and payment-request aggregate fields, recent tenants, and readiness.
- Dashboard aggregate now includes active user/outlet totals and total/last-24-hour platform audit counts from database-side counts.
- Invoice totals remain grouped by status/currency and are explicitly labeled as minor currency units, not recognized revenue.

### Platform settings

- `PlatformSetting` stores only platform name, support email, support URL, default timezone, and default display currency.
- Settings reads and writes use separate platform permissions; writes validate values, use optimistic concurrency, and atomically record an audit entry without placing setting values in audit metadata.
- The platform settings UI is connected to these contracts. Default display currency does not change invoice or payment currency.

## Security and scope

- SEC-003 is resolved. Assignment services validate the target user and referenced roles/outlets against the authenticated tenant and replace assignments transactionally; individual notification read/delete operations include owner, tenant, and non-deleted filters. Order operations, tenant metadata, and tenant audit-log reads enforce explicit permissions. Direct tenant creation is available only through registration or the separate platform contract.
- Tenant role permission assignment uses a literal allowlist. Every declared permission is classified exactly once as tenant-assignable or platform-only; unclassified future codes fail closed. Tests cover classification exhaustiveness and endpoint metadata.
- Unit tests and tenant-isolation E2E cover foreign assignments, cross-user notification mutation, insufficient order/audit permissions, and the removed tenant-creation route.
- Outlet CRUD endpoints have explicit outlet permissions and tenant-scoped repository access; the previous outlet-register note that its controller had only JWT protection was historical and has been removed from the active gaps.
- Platform administrators now use isolated OIDC identities, PKCE, mandatory exact `acr` assurance, explicit `(issuer, subject)` provisioning, fixed platform roles, and a four-hour absolute session. Keycloak is the approved production IdP, with phishing-resistant FIDO2/WebAuthn MFA. Production issuer validation requires HTTPS and a Keycloak realm path; the actual realm/`acr`, initial identity provisioning, and real sign-in remain a release gate (SEC-004). The OIDC library is loaded lazily so unrelated API startup and E2E tests do not require the IdP or ESM test-runner flags.
- SEC-001 uses the provider-documented Xendit callback token and retains fail-closed behavior and no-mutation integration coverage.
- API-002 remains resolved with gap: pending-only cancellation and tenant/platform CSV export are implemented; refund and reconciliation remain unavailable until channel support and ambiguous provider outcomes are safely handled.
- Platform settings are available only through an explicit allowlist; environment secrets remain deployment-owned and are not exposed by the settings API.

## Recorded validation results (latest available evidence)

The test counts below are recorded results, not a fresh full-suite run for this documentation update. Focused variance and audit-page checks are listed separately from the latest full API integration run.

| Validation                                          | Result                                                                                                                                                                                               |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run build`                                      | PASS — API, worker, and web tasks succeeded. Turbo emitted non-blocking optional OpenTelemetry dependency and output configuration warnings.                                                         |
| `npm run check-types`                               | PASS — API, web, worker, and UI package type checks succeeded.                                                                                                                                       |
| `npm run lint`                                      | PASS — all configured API, web, worker, and UI lint tasks succeeded.                                                                                                                                 |
| API unit suite                                       | PASS — 102 suites, 452 tests.                                                                                                                                                                        |
| API E2E suite                                         | PASS — 7 suites, 23 tests against disposable PostgreSQL/Redis; tenant/platform identity boundaries, permission enforcement, and data isolation pass.                                                  |
| Target backup/restore + migration rehearsal           | PASS — the dedicated test database was fully backed up and restored to an isolated PostgreSQL 18 database. The restored database passed migration-status and schema-drift checks for the 62-migration history. The earlier rehearsal against a production-like clone covered 50 migrations and included nine critical table counts. |
| Current migration status                              | PASS — repository and dedicated test database contain all 62 migrations; Prisma status and schema-drift checks pass. The production migration/schema state of `cafe_os` is unknown and it was not accessed. Local test evidence does not imply production rollout approval or post-deployment verification. |
| Invoice cancellation PostgreSQL integration         | PASS — 1 suite, 2 tests.                                                                                                                                                                             |
| Subscription and super-admin PostgreSQL integration | Previously passed — 2 suites, 27 tests, before subscription-history schema changes; rerun against the applied history migration before treating the new persistence contract as PostgreSQL-verified. |
| Inventory PostgreSQL integration                    | PASS — 2 suites, 10 tests                                                                                                                                                                            |
| Purchase-order validation                           | PASS — latest focused PostgreSQL integration: 1 suite, 11 tests; PO service unit: 1 suite, 8 tests. Covers partial receipts, variance snapshot/report, idempotency, and tenant isolation. |
| API integration suite                                | PASS — 24 suites, 130 tests, including health/Docker startup, billing fixture isolation, and Redis/queue integration. |
| Latest full API validation                           | PASS — unit, integration, and E2E suites: 133 suites / 605 tests total. |
| Tenant audit-log web page                            | PASS — web production build, lint, and typecheck passed; no component/E2E test runner is configured. |
| Worker retry-history integration                    | PASS — 1 suite, 2 tests |

## Remaining blockers and accepted gaps

| Gap               | Status            | Required next evidence or decision                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-003           | Resolved          | Explicit route permissions, tenant/platform permission classification, ownership checks, atomic assignment replacement, and notification owner scoping pass focused unit and tenant-isolation E2E coverage.                                                                                                                                                                            |
| SEC-004           | Resolved with gap | Keycloak is the approved production IdP; FIDO2/WebAuthn MFA is required. Exact realm issuer/`acr`, initial operators, secrets-manager configuration, and live sign-in/logout verification remain required before production.                                                                                                                                                       |
| OPS-002           | Resolved with gap | Repository and dedicated test database contain 62 migrations; status and schema-drift checks pass, and a PostgreSQL 18 clone passed backup/restore plus status/drift checks. Production `cafe_os` migration/schema status is unknown and it was not accessed. Production rollout approval and post-deployment checks remain outstanding. |
| DEP-001           | Resolved with gap | Root build, lint, and typecheck commands pass; production release artifacts/pipeline remain unverified.                                                                                                                                                                                                                                                                            |
| TEST-001          | Resolved with gap | Latest API validation passes 102 unit suites / 452 tests, 24 integration suites / 130 tests, and 7 E2E suites / 23 tests (133 suites / 605 tests total). Broader financial/platform lifecycle and browser E2E remain. |
| API-002           | Resolved with gap | Pending-only invoice cancellation and filtered tenant/platform CSV exports are implemented. Billing execution deduplicates by subscription/month and transactionally writes invoices with required outbox events. The earlier 50-migration disposable PostgreSQL deployment/schema-drift check and 60-migration local status are historical; current test migration status is tracked under OPS-002. Provider refund/reconciliation remain unavailable pending channel and terminal-status contracts. |
| API-003           | Resolved with gap | Tenant-visible plan-change history and next-renewal plan scheduling are implemented; repeated renewal for the same period does not duplicate renewal history or invoices. Migration status was up to date at the time it was checked for subscription-history changes; focused PostgreSQL verification after that migration remains pending. That historical check predates the latest Kitchen migration. Extended billing and unapproved platform lifecycle actions remain unavailable. |
| API-004 / SEC-002 | Resolved          | The explicit non-secret allowlist, permission checks, optimistic concurrency, audit logging, and settings UI are implemented and covered by tests.                                                                                                                                                                                                                                 |
| OPS-001 / OBS-002 | Resolved with gap | Worker identity, heartbeats, bounded attempts, and queue counts are available; define scheduler run history, retention, alerting, DLQ, and audited controls before adding workflows.                                                                                                                                                                                               |
| OBS-001           | Resolved with gap | A `super-admin.read`-protected API and UI expose redacted HTTP event summaries and aggregated metrics with bounded queries and 30-day retention. The UI supports 1-hour, 24-hour, and 7-day windows with UTC range labels. Raw stdout logs, CPU/memory, external Prometheus history, and alerting remain external.                                                                      |
| FE-002            | Resolved with gap | Health, liveness, queues, workers, bounded job attempts, selectable historical request aggregates, and redacted operational events are available; raw logs and system metrics remain external.                                                                                                                                                                                    |
| FE-001            | Resolved          | User/outlet and platform audit summaries are backed by the authorized platform aggregate and displayed in the dashboard.                                                                                                                                                                                                                                                           |
| INV-001           | Resolved with gap | Standard-cost PO variance capture and tenant reporting are implemented; entries remain `NOT_POSTED` until an accounting module and posting policy exist. |
| FE-004            | Resolved          | Tenant audit-log page `/app/audit-logs` consumes tenant list/detail APIs and is gated by `audit-log.read`; web build/lint/typecheck pass. Component/E2E coverage remains unavailable without a frontend test runner. |
| INV-002           | Resolved with gap | Inventory availability now reports on-hand, active-reserved, and available stock with tenant-total/per-warehouse alerts and target-stock/fixed-quantity suggestions. Reorder rules are tenant-scoped and transactionally replaced; focused PostgreSQL integration passes 8 tests, controller unit tests pass 5, and HTTP tenant-isolation E2E passes 10. API/web typechecks, monorepo lint, and individual API/web/worker production builds pass. No purchase orders are created; purchase automation remains out of scope without supplier/approval policy. |
| DOC-001           | Resolved          | The master register, priority matrix, audit report, and supporting module registers now share consistent status classifications; preserve synchronization in subsequent changes.                                                                                                                                                                                                   |

## Production readiness assessment

The repository is **not ready for production release** until SEC-004 exact issuer/`acr` configuration and real sign-in verification, explicit migration rollout approval/post-deployment checks, and remaining financial/platform/browser E2E coverage are complete. SEC-003's permission-boundary review and focused tenant-isolation E2E pass; the OPS-002 restore rehearsal also passed on a clone, but neither substitutes for production rollout evidence.
