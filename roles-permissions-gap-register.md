# Roles & Permissions Gap Register

## Implemented Contract

- `GET /roles` with `rbac.role.read`; tenant-owned role list.
- `GET /roles/:id` with `rbac.role.read`; tenant-owned role detail.
- `POST /roles` with `rbac.role.create`; body `{ name, permissionCodes? }`.
- `PUT /roles/:id` with `rbac.role.update`; body `{ name, permissionCodes? }`.
- `DELETE /roles/:id` with `rbac.role.delete`.
- `GET /permissions` with `rbac.permission.read`; global permission catalog.
- `GET /roles/:id/permissions` with `rbac.role.read`.
- `PUT /roles/:id/permissions` with `rbac.role.update`; body `{ permissionCodes: string[] }`.

## Confirmed Gaps and Risks

### BACKEND CONTRACT GAP

- No role description, system-role marker, assigned-user count, or permission count is returned.
- No platform-specific RBAC contract was verified; this UI is tenant-only.
- User-role assignment endpoints exist, but no user selector is added here because the operation belongs to the Users/RBAC boundary and should not use fabricated users.

### SECURITY GAP

- Backend role-permission assignment does not visibly validate every submitted permission code before `createMany`; unknown codes can produce invalid relation IDs. This should be hardened server-side before trusting arbitrary mutation input.
- Backend user-role assignment behavior should validate target user and role tenant ownership explicitly before exposing a mutation UI.

### FRONTEND GAP

- Role create/update form supports only the backend DTO's `name`; permission assignment is a separate explicit operation.
- No user-role assignment UI is included.

### REALTIME INFRASTRUCTURE GAP

- No RBAC realtime contract is exposed; authorization changes rely on backend/session reconciliation.

### TEST INFRASTRUCTURE GAP

- No dedicated frontend component test runner is configured for RBAC.