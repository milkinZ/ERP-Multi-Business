# Kitchen Gap Register

Verified against the current `apps/api` Kitchen, Orders, Recipes, Ingredients, Inventory, Prisma, and RBAC implementation.

## Supported Contract

- `GET /kitchen/orders` with `kitchen.read`; returns tenant-scoped Kitchen ticket aggregates derived from Sales Orders.
- `PATCH /kitchen/orders/:id/start` with `kitchen.update`.
- `PATCH /kitchen/orders/:id/ready` with `kitchen.update`.
- `PATCH /kitchen/orders/:id/serve` with `kitchen.update`.
- `PATCH /kitchen/orders/:id/cancel` with `kitchen.update`.
- `PATCH /kitchen/orders/:id/recall` with `kitchen.update`.
- Action bodies are validated as `UpdateKitchenStatusDto` with `status` and optional `reason`; current service methods use the route action and ignore the body values.

## State Machine

- `NEW` can move to `QUEUED` or `CANCELLED`, but no public enqueue endpoint exists.
- `QUEUED` can move to `COOKING` or `CANCELLED`.
- `COOKING` can move to `READY`, `CANCELLED`, or `RECALLED`.
- `READY` can move to `SERVED` or `RECALLED`.
- `RECALLED` can move to `COOKING`, `QUEUED`, or `CANCELLED`.
- `SERVED` and `CANCELLED` are terminal.

## Backend Contract Gaps

- No Kitchen detail endpoint exists; the frontend uses the queue only.
- No enqueue endpoint exists for explicit `NEW -> QUEUED` transitions.
- No priority mutation endpoint is exposed, despite an internal priority DTO/aggregate method.
- No Kitchen search, filtering, sorting, pagination, station management, operator assignment, timers, printing, or analytics endpoints.
- No Kitchen-specific recipe or ingredient usage response is exposed.
- No Kitchen-specific outlet filter is exposed; queue is tenant-scoped only.
- Kitchen controller/service does not explicitly enforce CAFE business type, although order workflow code restricts related order statuses to CAFE.

## Inventory and Fulfillment Boundary

- Kitchen actions change SalesOrder status and emit Kitchen domain events.
- Recipe-based ingredient consumption is implemented in Inventory fulfillment paths, not in Kitchen actions.
- The frontend does not calculate quantities or call Inventory mutation endpoints.

## Frontend Gaps

- No detail route exists because the backend has no Kitchen detail contract.
- No realtime UI is enabled; existing backend event subscriptions are not a verified shared web subscription contract.

## Test Infrastructure Gap

- No frontend test runner or Kitchen frontend test suite exists in `apps/web`.
