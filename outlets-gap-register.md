# Outlets Gap Register

## Implemented Contract

- `GET /outlets` requires `outlet.read` and supports bounded pagination, case-insensitive search, sorting by name or creation date, and `ACTIVE`, `DELETED`, or `ALL` status filters.
- `GET /outlets/:id`, `POST /outlets`, `PUT /outlets/:id`, and `DELETE /outlets/:id` are tenant-scoped and require the corresponding outlet permissions. Delete is a soft-delete.
- Tenant ownership is derived from authenticated request context, never from client-provided tenant IDs.
- `GET /users/:id/outlets` and `PUT /users/:id/outlets` require `rbac.user.outlet.manage`. Assignment replacement validates tenant ownership, restores soft-deleted assignment rows rather than duplicating unique keys, and clears session/refresh-token outlet context for removed outlets.
- `GET /auth/outlets` lists the authenticated user's active assigned outlets.
- `POST /auth/outlet/switch` requires a valid tenant session, CSRF protection, and an active outlet assignment. It rotates the refresh token and updates the persisted session outlet before returning a fresh access token.
- `/app/users` and `/app/users/:id` expose permission-gated outlet assignment controls. The tenant app shell lets users switch between assigned outlets without signing in again and clears cached tenant data after a successful switch.
- Warehouse assignment selectors consume paginated active outlet records rather than assuming the list response is an array.

## Verification Evidence (Local/Development)

- Migration `20261026000000_user_role_outlet_management` is applied to local `cafe_os`; Prisma reports all 63 migrations applied.
- Outlet assignment update returned `200`; the test account was verified with both Outlet Malang and Outlet Tulungagung.
- Authenticated outlet switching returned `200`; the accessible outlet list contained both assignments, the refresh token rotated, and the fresh access token reported the selected outlet.
- Deactivating the test account revoked all active sessions and refresh tokens. The test account is left inactive.
- Invitation service tests pass (4/4), API build passes, repository lint and type-check pass. Root build tasks reported success for API, web, and worker; the Turbo wrapper remained running after reporting completion and was stopped.
- No outlet analytics or detail relationship payload is part of this contract.
- Local/development outlet verification is complete. Production deployment remains outside this local result.
