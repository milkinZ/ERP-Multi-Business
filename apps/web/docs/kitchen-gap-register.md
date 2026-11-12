# Kitchen Gap Register

Verified against the current `apps/api` Kitchen, Orders, Recipes, Ingredients, Inventory, Prisma, and RBAC implementation.

## Migration and Rollout Status

The repository contains 65 migrations, including
`20261031000000_kitchen_station_routing_and_timers`. All 65 migrations were
applied successfully to the isolated local Docker database `cafe_os_test` at
`127.0.0.1:5433`; the Kitchen transaction/concurrency integration tests also
passed against that database. The local development database and production
were not used by these tests.

## Supported Contract

- `GET /kitchen/orders` with `kitchen.read`; returns Kitchen ticket aggregates derived from Sales Orders. Optional `status` (`QUEUED`, `COOKING`, `READY`) and `search` (ticket number or order ID, up to 100 characters) filters are supported. Optional `skip` and `take` provide offset pagination (`take` 1–100); requests omitting `take` retain the existing unpaginated response.
- Kitchen queue results respect the authenticated outlet scope when the user is outlet-bound; tenant-wide users retain tenant-wide queue visibility.
- `GET /kitchen/orders/:id` with `kitchen.read`; returns a released Kitchen ticket in the authenticated tenant/outlet scope, including active and terminal Kitchen statuses.
- `PATCH /kitchen/orders/:id/enqueue` with `kitchen.update`; explicitly releases an eligible pending order to Kitchen. It requires the authenticated tenant/outlet scope and a paid order or open bill. The row is locked during the transaction; release time, routing/timer snapshots, and audit record commit atomically, and successful enqueue emits an outlet-scoped realtime update. Repeated enqueue requests conflict.
- `GET /kitchen/outlets` and `GET /kitchen/stations`; station configuration is tenant/outlet-scoped.
- `POST /kitchen/stations` and `PATCH /kitchen/stations/:id`; station names and per-outlet category routes are validated, audited, and protected by database uniqueness constraints. Inactive stations can be reactivated.
- `GET /kitchen/operators` returns active users with `kitchen.update` in the authenticated outlet scope.
- `PATCH /kitchen/orders/:id/assignment` assigns or unassigns one primary operator. The operator must be active, authorized for Kitchen updates, and assigned to the ticket outlet; the change is audited transactionally.
- `GET /kitchen/analytics` supports start/end date, outlet, and station filters and reports ticket volume, average queue/cook duration, and item-level preparation SLA. Date-only end filters include the whole UTC calendar day.
- Product Kitchen settings store a normalized category and optional preparation-time target. Ticket release snapshots category, station route, and target so later product/station changes do not rewrite existing tickets.
- Starting/ready transitions persist per-item timer timestamps. Item timers show waiting, running, overdue, and completed states.
- Authenticated Socket.IO clients join tenant or tenant/outlet Kitchen rooms. Kitchen events are scoped to those rooms; web clients invalidate queue, detail, analytics, and station data. WebSocket connections can fall back to polling.
- Ticket detail includes the released order's persisted recipe composition snapshot and marks legacy orders without a snapshot; current recipes are not substituted into historical tickets.
- Queue ordering is priority descending, then Kitchen release time ascending (FIFO), then order ID for stable ties.
- `PATCH /kitchen/orders/:id/priority` with `kitchen.update`; priority is a non-negative 32-bit integer. Changes are tenant/outlet-scoped and audited.
- `GET /kitchen/settings` with `kitchen.read`; returns the tenant long-wait threshold in minutes.
- `PATCH /kitchen/settings` with `kitchen.update`; configures a positive 32-bit integer threshold, defaulting to 15 minutes. Changes are audited.
- Queued tickets are flagged as waiting too long after the configured threshold, measured from Kitchen release time. This is flag-only anti-starvation; it never raises priority automatically.
- `PATCH /kitchen/orders/:id/start`, `/ready`, `/serve`, `/cancel`, and `/recall` require `kitchen.update` and enforce tenant/outlet scope.
- Action bodies accept an optional matching `status` and a trimmed, bounded `reason`; conflicting status values are rejected. Successful status transitions, including actor, tenant/outlet, before/after status, and optional reason, are audited in the same transaction as the order transition and reservation/costing work.
- Kitchen routes verify the tenant is a CAFE before reading or mutating tickets. Outlet-bound users remain restricted to their authenticated outlet.
- Priority and wait-threshold writes and their tenant audit records are committed in the same database transaction.

## State Machine

- `NEW` can move to `QUEUED` through the explicit enqueue endpoint or to `CANCELLED`.
- `QUEUED` can move to `COOKING` or `CANCELLED`.
- `COOKING` can move to `READY`, `CANCELLED`, or `RECALLED`.
- `READY` can move to `SERVED` or `RECALLED`.
- `RECALLED` can move to `COOKING`, `QUEUED`, or `CANCELLED`.
- `SERVED` and `CANCELLED` are terminal.

## Backend Contract Gaps

- No known Kitchen backend contract gaps remain in the scope documented here.

## Inventory and Fulfillment Boundary

- Kitchen actions change SalesOrder status and emit Kitchen domain events.
- Recipe-based ingredient consumption is implemented in Inventory fulfillment paths, not in Kitchen actions.
- The frontend does not calculate quantities or call Inventory mutation endpoints.

## Frontend Coverage

- The Kitchen queue links to a tenant/outlet-scoped ticket detail route backed by the detail API, including ingredient composition from the immutable order snapshot.
- Search by ticket number/order ID and filter by queued, cooking, or ready status are available in the queue. Outlet-bound users remain restricted to their authenticated outlet.
- The queue supports station filtering, primary-operator assignment, station/category configuration, individual item timers, analytics, and an itemized browser-print view.
- The queue loads 50 tickets at a time with a load-more control; filter or search changes start a fresh result set.
- Kitchen events refresh the active queue and related details; the queue retains a 30-second polling fallback.
- Priority and long-wait threshold controls are available to users with `kitchen.update`; long-wait tickets are flagged without automatic reprioritization.

## Verification

- Frontend tests use Vitest, React Testing Library, and jsdom; Kitchen timer, station filtering/reactivation, assignment, analytics, realtime fallback, and print action tests are included.
- PostgreSQL integration tests verify transaction rollback and concurrent unique-key enforcement. The test guard requires `NODE_ENV=test`, a database ending in `_test`, and a non-zero Redis database.
- The focused Kitchen/product/WebSocket API suites passed (24 tests); both PostgreSQL Kitchen integration tests passed against `cafe_os_test`.
- The complete API unit run passed 473 of 482 tests. Its 9 remaining failures are in environment validation, recipes, authentication, refresh rotation, and user-outlet tests; no Kitchen or Kitchen-realtime tests failed in that run.
