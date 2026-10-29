# Kitchen Gap Register

Verified against the current `apps/api` Kitchen, Orders, Recipes, Ingredients, Inventory, Prisma, and RBAC implementation.

## Migration and Rollout Status

The repository contains the Kitchen migration
`20261025000000_kitchen_priority_and_wait_policy`, bringing the active history
to 62 migrations. It is applied to the dedicated test database, whose
migration status and schema-drift checks pass. Production `cafe_os`
migration/schema status is unknown and was not accessed. Do not treat the
migration as deployed to production until the approved release process
verifies it.

## Supported Contract

- `GET /kitchen/orders` with `kitchen.read`; returns Kitchen ticket aggregates derived from Sales Orders. Optional `status` (`QUEUED`, `COOKING`, `READY`) and `search` (ticket number or order ID, up to 100 characters) filters are supported. Optional `skip` and `take` provide offset pagination (`take` 1–100); requests omitting `take` retain the existing unpaginated response.
- Kitchen queue results respect the authenticated outlet scope when the user is outlet-bound; tenant-wide users retain tenant-wide queue visibility.
- `GET /kitchen/orders/:id` with `kitchen.read`; returns a released Kitchen ticket in the authenticated tenant/outlet scope, including active and terminal Kitchen statuses.
- Queue ordering is priority descending, then Kitchen release time ascending (FIFO), then order ID for stable ties.
- `PATCH /kitchen/orders/:id/priority` with `kitchen.update`; priority is a non-negative 32-bit integer. Changes are tenant/outlet-scoped and audited.
- `GET /kitchen/settings` with `kitchen.read`; returns the tenant long-wait threshold in minutes.
- `PATCH /kitchen/settings` with `kitchen.update`; configures a positive 32-bit integer threshold, defaulting to 15 minutes. Changes are audited.
- Queued tickets are flagged as waiting too long after the configured threshold, measured from Kitchen release time. This is flag-only anti-starvation; it never raises priority automatically.
- `PATCH /kitchen/orders/:id/start`, `/ready`, `/serve`, `/cancel`, and `/recall` require `kitchen.update` and enforce tenant/outlet scope.
- Action bodies are validated as `UpdateKitchenStatusDto` with `status` and optional `reason`; current service methods use the route action and ignore the body values.
- Priority and wait-threshold writes and their tenant audit records are committed in the same database transaction.

## State Machine

- `NEW` can move to `QUEUED` or `CANCELLED`, but no public enqueue endpoint exists.
- `QUEUED` can move to `COOKING` or `CANCELLED`.
- `COOKING` can move to `READY`, `CANCELLED`, or `RECALLED`.
- `READY` can move to `SERVED` or `RECALLED`.
- `RECALLED` can move to `COOKING`, `QUEUED`, or `CANCELLED`.
- `SERVED` and `CANCELLED` are terminal.

## Backend Contract Gaps

- No enqueue endpoint exists for explicit `NEW -> QUEUED` transitions.
- No configurable sorting, station management, operator assignment, timers, printing, or analytics endpoints; queue ordering is fixed to priority/FIFO. Search, active-status filtering, and opt-in pagination are supported.
- No Kitchen-specific recipe or ingredient usage response is exposed.
- Kitchen controller/service does not explicitly enforce CAFE business type, although order workflow code restricts related order statuses to CAFE.

## Inventory and Fulfillment Boundary

- Kitchen actions change SalesOrder status and emit Kitchen domain events.
- Recipe-based ingredient consumption is implemented in Inventory fulfillment paths, not in Kitchen actions.
- The frontend does not calculate quantities or call Inventory mutation endpoints.

## Frontend Gaps

- The Kitchen queue links to a tenant-scoped ticket detail route backed by the detail API.
- Search by ticket number/order ID and filter by queued, cooking, or ready status are available in the queue. Outlet-bound users remain restricted to their authenticated outlet.
- The queue loads 50 tickets at a time with a load-more control; filter or search changes start a fresh result set.
- No realtime UI is enabled; the queue refreshes every 30 seconds, but existing backend event subscriptions are not a verified shared web subscription contract.
- Priority and long-wait threshold controls are available to users with `kitchen.update`; long-wait tickets are flagged without automatic reprioritization.

## Test Infrastructure Gap

- No frontend test runner or Kitchen frontend test suite exists in `apps/web`.
- Backend unit coverage verifies tenant scoping, queue ordering, wait-flag calculation, permission metadata, and transactional audit writes; frontend behavior remains without automated component tests.
