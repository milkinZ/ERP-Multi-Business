# Platform Workers / Jobs / Queues Gap Register

## Current Status: BOUNDED VISIBILITY AND SCHEDULER HISTORY IMPLEMENTED; MUTATING CONTROLS DEFERRED

Worker identity/heartbeat, durable job-attempt history, authorized worker/job/scheduler reads, bounded failed-job summaries, and safe platform UI views are implemented. Job-attempt and scheduler history are retained for 30 days. Alerting/dead-letter policy and mutating queue controls remain intentionally unavailable.

## Contract Matrix

| Capability | Existing source | Scope / permission | Safe and authoritative | UI |
| --- | --- | --- | --- | --- |
| Queue snapshot | `GET /admin/queues` | Platform / `super-admin.read` | Fixed queues and bounded counts | Implemented on Jobs and Queues and reused by Observability |
| Queue definitions | API and worker queue constants | Internal infrastructure | Configuration, not runtime state | Not exposed separately |
| Worker identity/heartbeat | Worker runtime registry persisted in PostgreSQL; `GET /super-admin/workers` and `GET /super-admin/workers/:id` | Platform / `super-admin.read` | Persisted worker identity/status/heartbeat with explicit fields | Implemented on Workers |
| Job attempt history | `GET /super-admin/job-executions` | Platform / `super-admin.read` | Bounded metadata only; excludes payload, error text, correlation ID, and raw BullMQ ID | Implemented on Workers |
| Failed-job summary | `GET /super-admin/operational/failed-jobs` | Platform / `super-admin.read` | At most 50 safe summaries; no payload, raw error, or job ID | Implemented read-only on Jobs |
| Retry/remove | BullMQ library capability only | N/A | Global business idempotency not established | Omitted |
| Pause/resume | BullMQ library capability only | N/A | Incident procedure and audit contract absent | Omitted |
| Manual trigger | No allowlisted administrative job endpoint | N/A | No | Omitted |
| Scheduler configuration | API maintenance cron exists | Internal API | Configuration only; no UI DTO | Omitted |
| Scheduler execution history | `GET /super-admin/operational/scheduler-runs` | Platform / `super-admin.read` | Safe status/duration/error-code projection; 30-day retention | Implemented on Observability |

## Confirmed Gaps

### BACKEND CONTRACT GAP

- Worker and job-attempt read contracts are bounded, authorized, and backed by persisted records.
- The retry-history PostgreSQL/Redis integration suite verifies a retry series and uses isolated unique job names; API inventory/history integration evidence is separate.
- No scheduler configuration endpoint, alert policy, or dead-letter queue (DLQ) lifecycle contract exists.

### FRONTEND GAP

- Workers shows persisted identity, status, and heartbeat. The page also renders bounded recent job attempts without exposing raw payloads or errors.
- Jobs and Queues exposes bounded queue snapshots and no job-level mutation controls.
- Scheduler history and failed-job metadata are available on Observability and Jobs. Alerting and DLQ workflows remain unavailable.

### SECURITY GAP

- Generic retry, remove, pause, resume, and trigger actions remain unavailable because idempotency, audit behavior, and concurrency safety are not established.
- Raw BullMQ payloads, raw error text, and Redis data are never exposed to the browser.

### ARCHITECTURE GAP

- Worker identity/heartbeat, job execution history, and scheduler run history are application-owned and persisted with 30-day retention.

### OPERATIONAL GAP

- Durable job-attempt metadata and scheduler run history are queryable and purged after 30 days. BullMQ failed-job storage, alerting, and DLQ policy remain external/unresolved.

### REALTIME INFRASTRUCTURE GAP

- Worker, queue, and job-history views receive authenticated WebSocket invalidation signals and use polling fallback.
