# Gap Closure Priority Matrix

## Phase A — Deployment and security assurance

These are the issues that materially affect production safety, financial integrity, or delivery reliability.

- SEC-003 — Final auth/RBAC and tenant-boundary review required before production
- OPS-002 — Migration and deployment safety are not validated in the environment

Why this phase first:
- They affect trust boundaries and production safety.
- They can block deployment or allow uncontrolled financial mutation.
- they are dependency anchors for downstream validation.

**Resolved records:** SEC-001, DATA-001, ARCH-001, and API-001 are RESOLVED. API-002 and DATA-002 are RESOLVED WITH GAP. DEP-001 and OPS-001 are also RESOLVED WITH GAP based on current evidence; their bounded remaining work is recorded in the master register. SEC-001 evidence and official Xendit contract links are in `billing-gap-register.md`.

OPS-002 is the highest-priority remaining actionable gap: production migration/deployment sequence, backup/restore, and schema-drift behavior have not been demonstrated. Build and typecheck pass locally, but do not prove a safe database release.

## Phase B — Backend contract closure

- API-001 — Platform billing aggregate endpoint implemented and verified
- API-002 — RESOLVED WITH GAP: invoice payment/refund/cancellation/export capabilities remain intentionally unsupported pending policy and verified contracts
- API-003 — Subscription lifecycle contract mismatch for tenant plan changes
- API-004 — Platform settings API missing

Why this phase second:
- Frontend pages and tests cannot be made accurate until these contracts exist or are explicitly rejected as unsupported.
- These gaps define the real business API surface.

## Phase C — Transaction / concurrency hardening

- DATA-001 — Invoice numbering is now database-backed and concurrency-safe (resolved)
- ARCH-001 — Resolved: persisted tenant lifecycle plus mutation/audit/outbox atomicity proven with PostgreSQL rollback, worker-dispatch, and concurrency tests
- DATA-002 — RESOLVED WITH GAP: broad PostgreSQL concurrency/idempotency evidence passes; the specifically named race scenarios remain unproven

Why this phase third:
- These items are prerequisite for hardening business-critical state transitions.
- They must be validated before large UI or workflow expansions.

## Phase D — Operational / observability closure

- OPS-001 — RESOLVED WITH GAP: registry, heartbeat, durable job projection, and authorized worker reads exist; job-history/scheduler read contracts and UI integration remain absent, and retry-series test evidence needs stabilization
- OBS-001 — Secure log-query and historical metrics contract missing
- OBS-002 — Dead-letter and worker-health operational telemetry is not exposed as a safe UI contract

Why this phase fourth:
- These are important for production operations but not primary blockers if the app is not yet live.
- They depend on the contracts and deployment boundary becoming stable.

## Phase E — Frontend closure

- FE-001 — Dashboard aggregate coverage
- FE-002 — Observability UI coverage for safe signals only
- FE-003 — Platform settings is intentionally unavailable and should stay that way unless a contract exists

Why this phase fifth:
- Frontend work should proceed only after the backend contract is real and the associated risks are known.

## Phase F — Test / E2E closure

- TEST-001 — Critical E2E and regression coverage for platform and financial flows

Why this phase sixth:
- Testing should grow after backend contract and data-integrity work stabilizes.

## Phase G — Product enhancements / future scope

- DOC-001 — Canonical backlog cleanup and documentation consolidation
- Low-value enhancements that are outside the current production scope

Why this phase last:
- They are not production blockers.
- They should only be executed after the safety-critical phases are closed.

## Dependency-aware execution order

1. Validate the production migration/deployment procedure, including backup/restore and schema drift.
2. Complete the final RBAC and tenant-boundary review.
3. Stabilize retry-series job-history evidence and decide the bounded admin history contract.
4. Close the named DATA-002 race-test gaps.
5. Implement deferred API/product contracts only when business policy requires them.
6. Defer UI expansion and non-critical documentation cleanup until the relevant contracts exist.

## Qualitative priority summary

| Severity | Tracked gaps |
| --- | --- |
| P0 | 1 |
| P1 | 8 |
| P2 | 9 |
| P3 | 2 |

The repository is not production-ready as of this review.
