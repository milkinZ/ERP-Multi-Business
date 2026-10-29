# Platform Workers / Jobs / Queues Gap Register

## Current Status: BOUNDED VISIBILITY IMPLEMENTED; OPERATIONAL CONTROLS DEFERRED

Worker identity/heartbeat, durable job-attempt history, authorized worker and job-history reads, and safe platform UI views are implemented. Scheduler history, alerting/dead-letter policy, and mutating queue controls remain intentionally unavailable.

## Contract Matrix

| Capability | Existing source | Scope / permission | Safe and authoritative | UI |
| --- | --- | --- | --- | --- |
| Queue snapshot | `GET /admin/queues` | Platform / `super-admin.read` | Fixed queues and bounded counts | Implemented on Jobs and Queues and reused by Observability |
| Queue definitions | API and worker queue constants | Internal infrastructure | Configuration, not runtime state | Not exposed separately |
| Worker identity/heartbeat | Worker runtime registry persisted in PostgreSQL; `GET /super-admin/workers` and `GET /super-admin/workers/:id` | Platform / `super-admin.read` | Persisted worker identity/status/heartbeat with explicit fields | Implemented on Workers |
| Job attempt history | `GET /super-admin/job-executions` | Platform / `super-admin.read` | Bounded metadata only; excludes payload, error text, correlation ID, and raw BullMQ ID | Implemented on Workers |
| Failed-job detail | Raw jobs retained in Redis | N/A | No safe DTO/retention contract | Omitted |
| Retry/remove | BullMQ library capability only | N/A | Global business idempotency not established | Omitted |
| Pause/resume | BullMQ library capability only | N/A | Incident procedure and audit contract absent | Omitted |
| Manual trigger | No allowlisted administrative job endpoint | N/A | No | Omitted |
| Scheduler configuration | API maintenance cron exists | Internal API | Configuration only; no UI DTO | Omitted |
| Scheduler execution history | No persisted execution-history contract | N/A | No | Omitted |

## Confirmed Gaps

### BACKEND CONTRACT GAP

- Worker and job-attempt read contracts are bounded, authorized, and backed by persisted records.
- The retry-history PostgreSQL/Redis integration suite verifies a retry series and uses isolated unique job names; API inventory/history integration evidence is separate.
- No scheduler configuration/status/history endpoint exists.
- No alert policy or dead-letter queue (DLQ) contract exists.

### FRONTEND GAP

- Workers shows persisted identity, status, and heartbeat. The page also renders bounded recent job attempts without exposing raw payloads or errors.
- Jobs and Queues exposes bounded queue snapshots and no job-level mutation controls.
- Scheduler history, alerting, and DLQ workflows remain unavailable.

### SECURITY GAP

- Generic retry, remove, pause, resume, and trigger actions remain unavailable because idempotency, audit behavior, and concurrency safety are not established.
- Raw BullMQ payloads, raw error text, and Redis data are never exposed to the browser.

### ARCHITECTURE GAP

- Worker identity/heartbeat and job execution history are application-owned and persisted. Scheduler execution-history semantics and retention remain undefined.

### OPERATIONAL GAP

- Durable job-attempt metadata is queryable through the platform UI. Completed/failed retention, scheduler run history, alerts, and DLQ policy remain unspecified.

### REALTIME INFRASTRUCTURE GAP

- Worker/queue views use request-time queries. No WebSocket/realtime or automatic refresh contract has been added.
