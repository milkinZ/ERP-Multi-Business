# Platform Dashboard Gap Register

## Verified Data Matrix

| Metric | Backend source | Permission | Scope | Implemented |
| --- | --- | --- | --- | --- |
| Tenant total and lifecycle distribution | `GET /super-admin/billing/aggregate` | `super-admin.read` | Platform | Yes |
| Active user total | `GET /super-admin/billing/aggregate` | `super-admin.read` | Platform | Yes |
| Active outlet total | `GET /super-admin/billing/aggregate` | `super-admin.read` | Platform | Yes |
| Platform audit total and last-24-hour count | `GET /super-admin/billing/aggregate` | `super-admin.read` | Platform | Yes |
| Recent tenant records | `GET /super-admin/tenants` bounded default page | `super-admin.read` | Platform | Yes |
| Subscription totals, statuses, and plan distribution | `GET /super-admin/billing/aggregate` | `super-admin.read` | Platform | Yes |
| Invoice totals and amounts grouped by status/currency | `GET /super-admin/billing/aggregate` | `super-admin.read` | Platform | Yes; amounts are explicitly labeled in minor units and not as recognized revenue |
| Payment-request attempt totals and states | `GET /super-admin/billing/aggregate` | `super-admin.read` | Platform | Yes |
| Database, Redis, and BullMQ readiness | `GET /health/readiness` | Public health contract; platform page requires authenticated platform access | System | Yes |
| Worker and queue detail | `/platform/workers` and `/platform/observability` use bounded authorized read contracts | `super-admin.read` | Platform | Yes on their dedicated pages; not duplicated on the dashboard |

## Remaining Gaps

### FRONTEND GAP

- The dashboard consumes safe platform-wide user, outlet, and audit aggregates alongside the existing tenant, subscription, invoice, and payment-request summaries.
- Tenant analytics and tenant audit endpoints are not promoted to platform scope; the aggregate derives platform scope server-side.

### REALTIME INFRASTRUCTURE GAP

- No platform dashboard realtime contract exists. Dashboard values use request-time TanStack Query data.

### PERFORMANCE GAP

- The aggregate endpoint uses database counts/grouping and the recent-tenant query remains bounded. The dashboard does not load unbounded cross-tenant invoice or subscription collections.

### SECURITY GAP

- Platform aggregate APIs require explicit `super-admin.read` authorization; the dashboard does not accept a tenant identifier to change scope.
