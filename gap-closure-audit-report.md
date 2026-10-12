# Gap Closure Audit Report

## Executive summary

The repository is in a partially implemented but not production-ready state. The platform/admin surfaces are being treated carefully and responsibly: the project explicitly avoids unsupported UI and introduces no fake backend contract. This is positive from a correctness standpoint, but there are still several real production risks.

The remaining material risks are not UI polish issues. They include:

- unvalidated production migration/deployment and recovery procedures (OPS-002),
- incomplete final RBAC/tenant-boundary evidence (SEC-003),
- incomplete operational worker/job visibility (OPS-001 is RESOLVED WITH GAP),
- and specific concurrency stress-test evidence gaps (DATA-002 is RESOLVED WITH GAP).

The current evidence indicates a repository that is functionally capable in some domains, but not ready for production release without a controlled closure phase.

## Major findings

### 1. Webhook authentication contract reconciliation

The prior report incorrectly characterized the Xendit callback-token mechanism as missing cryptographic signature verification. The integration uses Payments API v3 Payment Requests (`POST /v3/payment_requests`), documented in [Create a payment request](https://docs.xendit.co/apidocs/create-payment-request), and handles its `payment.capture`, `payment.authorization`, and `payment.failure` notifications. Xendit's [Payment webhook notification](https://docs.xendit.co/apidocs/payment-webhook-notification) specifies the `x-callback-token` header as the origin-verification token and recommends checking it; [Integration security](https://docs.xendit.co/docs/integration-security) likewise directs integrations to verify the Dashboard webhook token and validate transaction IDs, amount, and status.

The controller verifies the token before billing processing; the gateway rejects missing configured credentials, missing headers, and mismatches. Xendit does not document HMAC or timestamp-signature verification for this notification. Duplicate delivery is guarded by the existing payment/capture idempotency key and unique receipt. SEC-001 is resolved in implementation; deployment must configure `XENDIT_WEBHOOK_TOKEN` from Xendit Dashboard.

### 2. Build and typecheck baseline is green; deployment proof remains open

Fresh root validation on the current branch shows:

- `npm run build` passed with exit code 0; API, worker, and web build tasks succeeded. Turbo emitted non-blocking dependency/output warnings.
- `npm run check-types` passed with exit code 0; all scheduled package typecheck tasks succeeded.
- Repository-wide lint was not rerun because package lint scripts can auto-fix files in this already-dirty worktree.

DEP-001 is RESOLVED WITH GAP: the previously cited build/typecheck failures are stale, while lint and production deployment evidence remain incomplete. OPS-002 remains the release-risk gate.

### 3. Platform contracts are intentionally limited but still incomplete

The repository distinguishes tenant-scoped `AuditLog` from platform-scoped `PlatformAuditLog`. API-001 and ARCH-001 are resolved. Platform settings remain intentionally unavailable, and the job-history/scheduler read surface and worker UI integration remain incomplete despite the existing worker registry and API worker endpoints.

### 4. Concurrency evidence is strong but not exhaustive

DATA-001 and ARCH-001 are RESOLVED. DATA-002 remains RESOLVED WITH GAP: the targeted API PostgreSQL suites provide strong evidence for payment, fulfillment rollback, purchase-order receiving, and webhook idempotency, but the dedicated stock-deduction and reservation/fulfillment race scenarios named in the closure record are still missing.

## Security findings

### Authentication and authorization

The repository contains JWT auth and permission guard infrastructure, and the platform/admin surfaces are separated by `super-admin.*` permissions. That structure is directionally correct and consistent with a tenant-isolated ERP model.

No direct authorization bypass was proven in the reviewed code. However, this is not the same as proving the complete system is safe. The remaining requirement is an explicit final authorization review and RBAC regression suites for tenant-scoped endpoints and platform-admin routes.

### Webhook security

SEC-001 is resolved against the provider-documented callback-token contract. Focused tests cover configured-token acceptance and fail-closed behavior, while the PostgreSQL regression verifies missing/invalid tokens cannot mutate a pre-correlated invoice, subscription, receipt, or financial outbox event. Existing tests retain duplicate, correlation, amount/currency, terminal ordering, and transaction rollback coverage.

### Secret stewardship

The project uses environment-backed configuration and explicit `ConfigService` patterns. This is a sensible production pattern, but it requires strict allowlisting before any future settings UI is exposed. No setting or secret should be surfaced to the browser without a narrow, typed contract.

## Data integrity findings

### Invoice numbering

`generateInvoiceNumber()` in the billing repository previously derived the next number from a count. This was not concurrency-safe. Under simultaneous invoice creation, two requests could generate the same number unless the database enforced uniqueness and the application retried on collision.

DATA-001 is now closed by moving allocation into the same PostgreSQL transaction as invoice creation and by maintaining a global `InvoiceNumberCounter` row. The project preserves the existing `INV-YYYYMM-######` pattern and the global `invoiceNumber` unique constraint while making the counter allocation atomic and safe under concurrent requests. The integration suite verifies sequential numbering, concurrent creation, rollback safety, and database uniqueness enforcement.

### Platform audit boundaries

`PlatformAuditLogService` tracks actor, tenant, requestId, and correlationId. ARCH-001 is resolved for the reviewed control-plane mutations: tenant lifecycle state or subscription plan state, platform audit, and outbox inserts now share one Prisma transaction. Tenant lifecycle status is persisted separately from `deletedAt`, with a database constraint keeping DEACTIVATED and the soft-deactivation timestamp consistent. PostgreSQL failure-injection tests prove rollback when mutation, audit, or outbox writes fail; success and concurrency cases verify database state and event counts. Committed events are delivered by the existing dispatcher after commit.

### Payment and subscription transitions

The repo contains tenant-scoped payment and subscription logic with transactional updates and outbox publication. However, the audited evidence does not prove a complete concurrency and idempotency matrix for the financial boundary. This should be treated as a P1 risk until proven by tests.

## Backend contract findings

The repo contains clear backend contracts for:

- tenant billing list/detail,
- current subscription reads,
- platform tenant reads,
- platform subscription reads,
- platform audit log reads,
- readiness/liveness checks,
- and queue snapshot reads.

The remaining contracts are the ones that matter to production operations:

- no safe payment/refund/cancel/export contract,
- no tenant plan catalog and lifecycle contract,
- no platform settings contract,
- no job-history read or scheduler execution-history contract, although worker registry/heartbeat, durable job projection, and worker read endpoints now exist,
- no secure log/query metrics endpoint for operational UI.

API-002 is RESOLVED WITH GAP: the supported billing surface stays limited to existing invoice and billing flows; payment/refund/cancel/export/reconciliation behavior remains unsupported pending an approved contract.

API-001 is now resolved: the repository exposes a verified platform billing aggregate endpoint under `super-admin.read` using PostgreSQL `groupBy` queries, explicit response typing, and route-level authorization tests. These remaining items are not speculative requirements; they are still identified by the repository documentation and validated by the backend design evidence.

## Frontend findings

The frontend is doing the right thing in some areas: it intentionally shows unavailable states where no backend contract exists. This is preferable to fake data or fake metrics.

Still, there are gaps that are valid product-level limitations:

- dashboard cannot show payment or subscription aggregates without new server contracts,
- observability remains limited to readiness/liveness and queue snapshots,
- platform settings remain explicitly unavailable,
- the Workers page does not yet consume the authorized worker endpoints, and Jobs remains bounded to the safe queue-level surface.

These are honest gaps rather than hidden defects, but they affect the completeness of the platform admin experience.

## Operational findings

The repo includes supporting observability infrastructure, health checks, Prometheus-style metrics, BullMQ integration, and worker instrumentation. However, those are not yet a complete operational picture for the platform admin console.

Worker identity/heartbeat and job execution attempts are persisted, and the API exposes worker list/detail under `super-admin.read`. The Workers page still renders unavailable; there is no job-history read or scheduler-history API. The highest-priority operational limitation is unvalidated production migration/deployment and recovery (OPS-002).

## Testing findings

The repository does not currently provide strong evidence that all high-risk flows are protected by end-to-end and concurrency tests.

Remaining evidence gaps:

- named inventory/reservation/fulfillment race scenarios (DATA-002),
- deterministic multi-attempt job-history behavior (OPS-001; combined suite failed once, isolated retry case passed),
- production migration/deployment and backup recovery (OPS-002),
- and final RBAC/tenant-boundary regression coverage (SEC-003).

## Architecture findings

The architecture is generally disciplined in separating:

- tenant-scoped ERP contracts,
- platform-scoped admin contracts,
- and infrastructure observability from business data.

The platform mutation/audit/outbox boundary and tenant lifecycle state gap (ARCH-001) are resolved for the reviewed super-admin operations. The repository-wide lint gate still fails on 16 pre-existing warnings in `packages/ui/src/button.js`, `card.js`, and `code.js`; focused API lint, typecheck, build, and lifecycle tests pass.

## Accepted-with-gap review

The following items are intentionally accepted as restricted rather than reopened as defects:

- platform settings remains unavailable until a safe contract exists,
- the Workers page remains unavailable until it consumes the existing authorized worker endpoints and a bounded job-history contract exists,
- no fake metrics or unsupported controls are implemented,
- no tenant analytics are surfaced to the platform layer without platform-scoped backend contracts.

These are not treated as bugs; they are explicitly documented as unsupported until contract and security requirements are satisfied.

## Recommended execution order

1. Close OPS-002 with production-like migration/deployment, backup/restore, and schema-drift verification.
2. Complete the final SEC-003 tenant-boundary and RBAC review.
3. Stabilize OPS-001 retry-history evidence and decide whether to expose bounded job history.
4. Close only the remaining DATA-002 race-test evidence gaps.
5. Keep API-002 operations explicitly unavailable unless business policy defines their requirements.

## Production readiness assessment

Current status: NOT READY.

Conditions that keep it from being production-ready:

- production migration/deployment, backup/restore, and schema-drift behavior are not validated (OPS-002),
- a final full RBAC and tenant-boundary review remains open (SEC-003),
- operational worker/job history exposure is incomplete (OPS-001),
- and named stress scenarios remain unproven (DATA-002).

SEC-001, DATA-001, ARCH-001, and API-001 are RESOLVED. API-002 and DATA-002 are RESOLVED WITH GAP. Current root build and typecheck pass; lint was not rerun in this dirty worktree.

This is not a failure of the repository’s discipline; it is a normal readout of a project that is functionally close but still requires a formal closure phase before production release.
