# Platform Observability Gap Register

## Current Status: OPERATIONAL HISTORY AND REALTIME CONSOLE IMPLEMENTED; EXTERNAL MONITORING GAPS REMAIN

Readiness, liveness, fixed queue snapshots, persisted worker status, bounded job attempts, scheduler execution history, and safe failed-job summaries are available through authorized contracts. The console receives authenticated WebSocket invalidation signals and falls back to polling when disconnected. Request metrics and redacted 5xx/slow-response event summaries retain selectable 1-hour, 24-hour, and 7-day windows inside the 30-day retention limit. Scheduler and persisted job-attempt history are purged after 30 days. Raw stdout logs, external Prometheus history, CPU/memory, and external alerting remain outside the application. This corresponds to OBS-001 and FE-002 (Resolved with Gap), OPS-001 / OBS-002 (Resolved with Gap).

## Contract Matrix

| Signal                                    | Existing source                                                | Scope / permission                                                                                       | Authoritative                                                                     | Implemented                                                               |
| ----------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Database readiness                        | `GET /health/readiness` → `database.ok`                        | System; platform UI requires platform session                                                            | Yes                                                                               | Yes                                                                       |
| Redis readiness                           | `GET /health/readiness` → `redis.ok`                           | System; platform UI requires platform session                                                            | Yes                                                                               | Yes                                                                       |
| BullMQ readiness                          | `GET /health/readiness` → `bullmq.ok/status`                   | System; platform UI requires platform session                                                            | Yes                                                                               | Yes                                                                       |
| Application liveness                      | `GET /health/liveness` → `success/message/timestamp`           | System; platform UI requires platform session                                                            | Yes                                                                               | Yes                                                                       |
| Queue snapshots                           | `GET /admin/queues` → bounded fixed queue list                 | `super-admin.read`                                                                                       | Yes                                                                               | Yes                                                                       |
| Worker identity/status                    | `GET /super-admin/workers` and `GET /super-admin/workers/:id`  | `super-admin.read`                                                                                       | Persisted worker identity and heartbeat                                           | API and Workers UI                                                        |
| Job attempt history                       | `GET /super-admin/job-executions`                              | `super-admin.read`                                                                                       | Bounded metadata projection, no payload/error/correlation data                    | API and Workers UI                                                        |
| Scheduler run history                     | `GET /super-admin/operational/scheduler-runs`                  | `super-admin.read`                                                                                       | Persisted status/duration and safe error code; 30-day retention                    | Observability UI                                                          |
| Failed-job summaries                      | `GET /super-admin/operational/failed-jobs`                     | `super-admin.read`                                                                                       | Bounded queue/job names, attempts, and failure time; no payload/error              | Jobs UI, read-only                                                        |
| Operational realtime                      | `/platform-operations` WebSocket namespace                     | Valid platform JWT/session and `super-admin.read`                                                        | Redis invalidation signals; clients refetch authorized HTTP contracts              | Observability, Jobs, Workers, and dashboard health with polling fallback  |
| Prometheus metrics                        | `GET /metrics` text exposition                                 | Operational infrastructure                                                                               | External monitoring source                                                        | Not surfaced in platform UI                                               |
| Request/error/latency metrics             | Prometheus registry/interceptor plus persisted minute buckets  | API: `GET /super-admin/operational/telemetry`, `super-admin.read`, selectable 1h/24h/7d windows, max 30d | Aggregated database buckets                                                       | Platform UI shows request count, error count, mean latency, and UTC range |
| Operational error/slow-response summaries | HTTP interceptor; only 5xx or >=2s                             | Same API permission and date bounds                                                                      | Redacted event rows; 30-day retention; route template/method/status/duration only | Platform UI; no request body, user/tenant ID, IP, or exception text       |
| Structured application logs               | Application stdout/logger infrastructure                       | Operational infrastructure; no raw log-query API                                                         | Runtime output only                                                               | Not surfaced in platform UI                                               |
| Audit activity                            | Tenant-scoped `/audit-logs`; platform audit reads are separate | Tenant or explicit platform scope                                                                        | Yes for their own scope                                                           | Not included on observability page                                        |
| CPU/memory/uptime/history                 | No browser-safe platform contract                              | N/A                                                                                                      | No                                                                                | No                                                                        |

## Remaining Gaps

### BACKEND CONTRACT GAP

- No raw secure platform log-query endpoint exists; logs remain runtime output.
- No CPU, memory, uptime-history, incident, or platform alert API exists.
- No in-app alert policy or dead-letter queue (DLQ) lifecycle contract exists; failed-job summaries are read-only metadata.

### FRONTEND GAP

- Observability displays readiness, liveness, bounded queue snapshots, scheduler runs, historical request aggregates with selectable time windows, and redacted operational event summaries. Jobs displays queue snapshots and safe failed-job summaries; Workers displays authorized worker identity/heartbeat and safe bounded job attempts.
- The UI intentionally omits raw logs, audit activity, external Prometheus history, failed-job payloads, and DLQ controls. Mutating job controls remain unavailable.

### REALTIME INFRASTRUCTURE GAP

- Authenticated WebSocket signals invalidate operational query data; polling continues at a slower safety interval while connected and uses a shorter interval when disconnected.

### SECURITY GAP

- Health endpoints expose dependency status only; the platform UI still requires an authenticated `super-admin.read` session.
- Worker/job reads use explicit platform authorization and avoid frontend-supplied tenant scope.
- Raw log, audit, or additional metrics UI requires authorization, redaction of request bodies/tokens/credentials/provider secrets, and a defined retention policy.

### OPERATIONAL GAP

- External monitoring remains authoritative for raw logs, system metrics, and alerts. In-app request telemetry is best-effort buffered and may drop data at bounded-buffer capacity; failed-job summaries do not replace a DLQ resolution procedure.
