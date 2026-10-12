# Platform Dashboard Gap Register

## Verified Data Matrix

| Metric | Backend source | Permission | Scope | Implemented |
| --- | --- | --- | --- | --- |
| Tenant total | `GET /super-admin/tenants` response `total` | `super-admin.read` | Platform | Yes |
| Recent tenant records | `GET /super-admin/tenants` bounded default page | `super-admin.read` | Platform | Yes |
| Database readiness | `GET /health/readiness` response `database.ok` | Public health contract; platform route still requires platform access | System | Yes |
| Redis readiness | `GET /health/readiness` response `redis.ok` | Public health contract; platform route still requires platform access | System | Yes |
| BullMQ readiness | `GET /health/readiness` response `bullmq.ok/status` | Public health contract; platform route still requires platform access | System | Yes |
| Subscription totals/distribution | No platform aggregate endpoint | N/A | N/A | No |
| Invoice totals/revenue | No platform aggregate endpoint | N/A | N/A | No |
| User or outlet totals | No platform aggregate endpoint | N/A | N/A | No |
| Platform audit activity | Audit logs are tenant-scoped only | N/A | Tenant | No |
| Worker/queue dashboard detail | Health exposes readiness only; no platform dashboard contract | N/A | System | No |

## Confirmed Gaps

### BACKEND CONTRACT GAP

- No platform subscription aggregate endpoint exists for lifecycle or plan distribution.
- No platform billing aggregate endpoint exists for invoice totals, revenue, outstanding balances, or collection metrics.
- No platform-scoped user or outlet aggregate endpoint exists.
- No platform-scoped audit activity endpoint exists.
- No dedicated platform worker, queue, scheduler, or job summary contract exists beyond readiness checks.
- Tenant analytics endpoints remain tenant-scoped and cannot be reused for platform metrics.

### FRONTEND GAP

- The dashboard does not expose subscription, billing, user, outlet, audit, or detailed queue sections because authoritative platform sources are absent.

### REALTIME INFRASTRUCTURE GAP

- No platform dashboard realtime contract exists. Dashboard values use request-time TanStack Query data.

### PERFORMANCE GAP

- A future dashboard aggregate endpoint should use database counts/grouping and bounded recent-record queries. The current dashboard does not load invoices, subscriptions, or other unbounded cross-tenant collections.

### SECURITY GAP

- Platform aggregate APIs must continue to use explicit `super-admin.*` authorization. Tenant-scoped analytics and audit endpoints must not be promoted to platform scope by accepting a frontend-supplied `tenantId`.
