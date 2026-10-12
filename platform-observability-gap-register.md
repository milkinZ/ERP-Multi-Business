# Platform Observability Gap Register

## Contract Matrix

| Signal | Existing source | Scope / permission | Authoritative | Implemented |
| --- | --- | --- | --- | --- |
| Database readiness | `GET /health/readiness` → `database.ok` | System; existing public health contract | Yes | Yes |
| Redis readiness | `GET /health/readiness` → `redis.ok` | System; existing public health contract | Yes | Yes |
| BullMQ readiness | `GET /health/readiness` → `bullmq.ok/status` | System; existing public health contract | Yes | Yes |
| Application liveness | `GET /health/liveness` → `success/message/timestamp` | System; existing public health contract | Yes | Yes |
| Queue snapshots | `GET /admin/queues` → bounded fixed queue list | `super-admin.read` | Yes | Yes |
| Worker identity/status | `GET /super-admin/workers` and `GET /super-admin/workers/:id` | `super-admin.read` | Yes for persisted worker identity and heartbeat | API implemented; Workers UI does not consume it |
| Prometheus metrics | `GET /metrics` text exposition | Operational infrastructure; no platform UI contract | Yes for external monitoring | No |
| Request/error/latency metrics | Prometheus registry and interceptor | External monitoring only | Yes for external monitoring | No |
| Structured logs | Application stdout/logger infrastructure | Operational infrastructure; no secure log-query API | Yes for runtime logs | No |
| Audit activity | Tenant-scoped `/audit-logs` only | Tenant scope | Yes for tenants, not platform | No |
| CPU/memory/uptime/history | No platform response contract | N/A | No | No |

## Confirmed Gaps

### BACKEND CONTRACT GAP

- Platform-authorized worker list/detail endpoints exist, but the Workers page does not consume them.
- No secure platform log-query endpoint exists; application logs remain runtime output.
- No platform audit activity read contract exists.
- No historical request rate, error rate, latency, CPU, memory, uptime, or incident API exists for the UI.
- Queue snapshots expose counts only. Durable job-attempt history exists in PostgreSQL but has no platform read contract; raw job payloads and stalled-job details remain unavailable.

### FRONTEND GAP

- The observability page intentionally omits logs, audit activity, Prometheus metrics, and historical telemetry because no safe frontend contracts exist. Worker detail is exposed through separate authenticated API endpoints but is not consumed by the current Workers page.

### REALTIME INFRASTRUCTURE GAP

- No platform observability realtime contract exists. The UI uses request-time TanStack Query reads with a short stale time and no automatic polling or WebSocket additions.

### SECURITY GAP

- `/health`, `/health/readiness`, and `/health/liveness` are existing public operational endpoints. They expose only dependency status, not tenant records or secrets, and the platform UI still requires an authenticated `super-admin.read` session.
- Any future worker, log, audit, or metrics UI must add explicit platform authorization and redact job payloads, request bodies, tokens, credentials, and provider secrets.

### OPERATIONAL GAP

- External Prometheus/Grafana and alerting infrastructure exist, but their historical data is not surfaced through the platform UI. Operational dashboards remain external to this module.

## Security Review

- Queue reads use `JwtAuthGuard`, `PermissionGuard`, and `super-admin.read`.
- No frontend-controlled `tenantId` is accepted for observability scope.
- No raw job payloads, logs, tokens, credentials, or tenant analytics are returned by the implemented observability UI.
- Readiness and liveness remain separate signals.
