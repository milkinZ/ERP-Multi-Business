# Gap Closure Priority Matrix

## Current state

**IN PROGRESS — not production-ready.** SEC-003's broader tenant permission boundaries now have explicit route checks and passing unit/E2E regressions; OBS-001 has a protected, redacted historical telemetry contract and UI. Keycloak is the approved production IdP, but the realm, exact MFA `acr`, and real sign-in remain unverified. The repository and dedicated test database have all 62 migrations; migration status, schema drift, and a PostgreSQL 18 backup/restore rehearsal passed on an isolated clone. Production `cafe_os` status is unknown. Production rollout approval/post-checks and financial/platform/browser E2E coverage remain outstanding.

## Phase A — Deployment and security assurance

| Gap                                                | State             | Evidence / remaining work                                                                                                                                                                                                      |
| -------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SEC-003 — final RBAC and tenant-boundary assurance | Resolved          | User-role/outlet ownership and notification owner checks are enforced; order, tenant metadata, and tenant audit-log endpoints have explicit permission guards; tenant permission classification fails closed and is exhaustive. Unit and tenant-isolation E2E regressions pass. |
| SEC-004 — platform identity provider and MFA       | Resolved with gap | OIDC, PKCE, exact identity provisioning, MFA `acr` enforcement, and four-hour absolute sessions are implemented. Keycloak is selected; production issuer validation requires HTTPS and a `/realms/<realm>` path. Exact host/realm and approved `acr`, initial identities, secret-manager setup, and live sign-in remain a release blocker. |
| OPS-002 — migration/deployment safety              | Resolved with gap | Repository and dedicated test DB have all 62 migrations; migration status, schema drift, and a PostgreSQL 18 backup/restore rehearsal on an isolated clone passed. Production `cafe_os` migration/schema status is unknown and it was not accessed. Production rollout approval and post-deploy checks remain release evidence. |
| DEP-001 — build, lint, typecheck gates             | Resolved with gap | Root build, no-warning lint, and typecheck pass. A non-blocking optional OpenTelemetry workspace dependency warning remains; production release validation is separate.                                                        |

## Phase B — Backend and product contracts

| Gap                                                            | State             | Evidence / remaining work                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API-001 — platform billing aggregate                           | Resolved          | Authorized database-backed aggregate exists and is consumed by the dashboard.                                                                                                                                                                                                                                                                                                                                                                                             |
| API-002 — refund, cancellation, export, reconciliation         | Resolved with gap | Pending-only safe cancellation and audited/tenant-scoped streaming CSV exports are implemented; billing execution deduplicates invoice creation by subscription/month and writes required outbox events atomically. The earlier 50-migration disposable PostgreSQL deployment/schema-drift check and 60-migration local status are historical; current test migration status is tracked under OPS-002. Refund and reconciliation remain unavailable until Xendit channel and ambiguous-outcome behavior are verified. |
| API-003 — tenant subscription lifecycle                        | Resolved with gap | Tenant-visible plan-change history records event type, actor, timestamp, and sanitized metadata, with tenant scoping and transactional plan-change persistence. Plan changes remain scheduled for the next renewal without proration, and repeated renewals for the same period are idempotent; renewal/billing PostgreSQL integration has passed, but PostgreSQL verification after the subscription-history migration remains pending. Extended billing and unapproved platform lifecycle actions remain unavailable. |
| API-004 / SEC-002 — platform settings and secret configuration | Resolved          | Allowlisted non-secret settings are persisted, validated, version-checked, audited, and consumed by the permission-aware settings UI; deployment secrets remain external.                                                                                                                                                                                                                                                                                                 |
| INV-001 — standard-cost purchase-price variance                 | Resolved with gap | PO receipts persist variance snapshots; the tenant-scoped report provides date filters, pagination, and per-currency totals. Focused PO PostgreSQL integration passes 11 tests and service unit tests pass 8. Entries are `NOT_POSTED`; accounting posting awaits an accounting module and approved policy. |
| INV-002 — inventory availability and replenishment              | Resolved with gap | Tenant-scoped rules configure tenant-total or per-warehouse thresholds, alert-only or alert-and-suggest actions, and target-stock/fixed-quantity recommendations against available stock. Rule changes are tenant/item/warehouse validated and atomic; focused PostgreSQL/HTTP tests, typecheck, lint, and production builds pass. No PO is created; automated purchasing needs a separate supplier and approval contract. |

## Phase C — Transaction and concurrency integrity

| Gap                                                 | State    | Evidence / remaining work                                                                                                                  |
| --------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| DATA-001 — invoice numbering                        | Resolved | Transactional database counter and uniqueness constraint.                                                                                  |
| ARCH-001 — platform mutation/audit/outbox atomicity | Resolved | PostgreSQL rollback, worker dispatch, and concurrent lifecycle coverage.                                                                   |
| DATA-002 — named mutation races                     | Resolved | PostgreSQL tests cover `10 - 7 - 7` fulfillment, duplicate same-order fulfillment, concurrent reservation/release, and reservation expiry. |

## Phase D — Operational visibility

| Gap                                                | State             | Evidence / remaining work                                                                                                                                                                                |
| -------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OPS-001 — workers and job history                  | Resolved with gap | Authorized bounded history API and UI plus retry-series integration test; scheduler history, retention, alerts, and incident controls need policy.                                                       |
| OBS-001 — secure log query and historical metrics  | Resolved with gap | Protected platform API and UI expose redacted operational events and aggregate HTTP metrics with bounded queries and 30-day retention; raw application logs, system metrics, and alerts remain external. |
| OBS-002 — worker alerting and dead-letter handling | Resolved with gap | Worker status and bounded attempt history are visible; alerting/DLQ workflows and operational policy remain absent.                                                                                      |

## Phase E — Frontend coverage

| Gap                             | State             | Evidence / remaining work                                                                                                                                                           |
| ------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FE-001 — platform dashboard     | Resolved          | Displays authoritative tenant, user, outlet, subscription, invoice, payment-request, platform audit, and readiness aggregates.                                                      |
| FE-002 — observability UI       | Resolved with gap | Health, liveness, queues, workers, bounded job attempts, historical request aggregates, and redacted operational events are available; raw logs and system metrics remain external. |
| FE-003 — platform settings page | Resolved          | Permission-aware UI consumes the allowlisted settings API; settings remain separate from deployment secrets and invoice currency.                                                   |
| FE-004 — tenant audit-log page  | Resolved          | `/app/audit-logs` and its navigation item consume tenant list/detail APIs and are gated by `audit-log.read`; platform audit remains separate. Web build, lint, and typecheck pass; no frontend component/E2E runner is configured. |

## Phase F — Test / E2E closure

| Gap                                  | State             | Evidence / remaining work                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TEST-001 — critical end-to-end flows | Resolved with gap | Latest full API validation passed unit 102 suites / 452 tests, integration 24 suites / 130 tests, and E2E 7 suites / 23 tests (133 suites / 605 tests total). The prior integration failures are not present in this run. Broader financial/platform lifecycle and browser E2E remain outstanding. |

## Phase G — Documentation and future scope

| Gap                         | State    | Evidence / remaining work                                                                                                                                                                                                                         |
| --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DOC-001 — canonical backlog | Resolved | The master register is the canonical inventory; the priority matrix records sequencing and module registers provide scoped contracts/evidence. Statuses and remaining work are synchronized; maintain that consistency as implementation changes. |

## Dependency-aware next actions

1. Configure Keycloak for production, approve the realm's exact MFA `acr` values, provision initial platform identities, and verify real sign-in/logout.
2. Obtain explicit rollout approval and an approved persistent backup destination; deploy only through the release job and verify health/schema state afterward.
3. Expand TEST-001 with broader financial/platform lifecycle and browser E2E coverage; retain PostgreSQL integration proof for successful webhook processing and audit immutability.
4. Keep the no-autofix build/lint/typecheck gates in CI and resolve the non-blocking optional OpenTelemetry workspace metadata warning.
5. Complete approved billing contracts and define scheduler, alert, and DLQ operational policies before adding remaining controls.
6. Add E2E coverage for critical platform and financial user journeys.
7. Keep historical telemetry unavailable until safe source contracts and retention/redaction evidence are approved.
