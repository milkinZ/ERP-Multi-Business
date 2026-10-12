# Platform Workers / Jobs / Queues Gap Register

## Current Status: RESOLVED WITH GAP

Worker identity/heartbeat persistence, durable job execution projection, and authorized worker list/detail endpoints exist. Job-history reads, scheduler execution history, and UI integration remain open; retry-history integration evidence needs stabilization.

## Contract Matrix

| Capability | Existing source | Scope / permission | Safe and authoritative | UI |
| --- | --- | --- | --- | --- |
| Queue snapshot | `GET /admin/queues` | Platform / `super-admin.read` | Yes, fixed queues and bounded counts | Implemented on Jobs and Queues and reused by Observability |
| Queue definitions | API and worker queue constants | Internal infrastructure | Yes as configuration, not runtime state | Not exposed separately |
| Worker identity/heartbeat | Worker runtime registry persisted in PostgreSQL; `GET /super-admin/workers` | Platform / `super-admin.read` | Yes for persisted runtime identity and heartbeat | Backend exists; Workers page still renders unavailable |
| Worker status | Worker list/detail endpoints return a bounded `PlatformWorkerResponse` | Platform / `super-admin.read` | Yes for worker status and last heartbeat | Not consumed by current page |
| Job list/detail | `JobExecution` rows are persisted by BullMQ event handlers; no platform query API | N/A | Durable projection exists; read contract is absent | Omitted |
| Failed-job detail | Queue counts only; raw jobs retained in Redis | N/A | No safe DTO/retention contract | Omitted |
| Retry/remove | BullMQ library capability only | N/A | Business idempotency not established globally | Omitted |
| Pause/resume | BullMQ library capability only | N/A | No incident procedure/audit contract | Omitted |
| Manual trigger | No allowlisted administrative job endpoint | N/A | No | Omitted |
| Scheduler configuration | API maintenance cron exists | Internal API | Configuration only; no UI DTO | Omitted |
| Scheduler execution history | Maintenance scheduler configuration exists; no persisted execution-history contract | N/A | No | Omitted |

## Confirmed Gaps

### BACKEND CONTRACT GAP

- The worker registry, heartbeat, stale status, and authorized worker list/detail endpoints exist; the Workers UI does not consume them and still describes them as unavailable.
- Job attempts are persisted, but there is no bounded job-history query endpoint or safe failure-history DTO.
- The retry-history integration suite was inconsistent in this audit: the combined registry/history run had one failure (3/4 tests passed), while the isolated retry-series case passed. Stabilize this evidence before treating retry capture as fully proven.
- No platform job retry, remove, queue pause/resume, or manual trigger endpoint exists.
- No scheduler configuration/status/history endpoint exists.

### FRONTEND GAP

- Workers shows an explicit unavailable state despite the backend registry and authorized worker read endpoints now being present.
- Jobs and Queues exposes only the existing bounded queue snapshot and explicitly omits job-level controls.

### SECURITY GAP

- Generic retry, remove, pause, resume, and trigger actions remain intentionally unavailable because global business idempotency, audit behavior, and concurrency safety are not established.
- Raw BullMQ job payloads and Redis data are never exposed to the browser.

### ARCHITECTURE GAP

- Worker identity/heartbeat is application-owned and persisted. Remaining architecture work is the authorized job-history read surface and UI consumption, plus explicit scheduler execution-history semantics.

### OPERATIONAL GAP

- Queue snapshots retain counts only; job execution projections exist in PostgreSQL but are not queryable from the platform UI. Completed/failed retention and scheduler run history remain unspecified.

### REALTIME INFRASTRUCTURE GAP

- No worker/queue realtime UI contract exists. Existing pages use request-time query reads without adding WebSocket or polling infrastructure.
