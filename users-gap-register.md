# Users Gap Register

## Implemented Contract

- `GET /users`
- `GET /users/:id`
- Scope: authenticated tenant from `CurrentUser().tenantId`
- Permission: `user.read`
- Safe response fields: `id`, `email`, `roles`, `outlets`, `createdAt`, `updatedAt`
- Role summary fields: `id`, `name`
- Outlet summary fields: `id`, `name`

## Verified Endpoints

### Current authenticated user

- `GET /auth/me`
- Scope: current authenticated session
- Guard: `JwtAuthGuard`
- Response: JWT user context (`userId`, `tenantId`, `roleId`, `outletId`, `permissions`)
- This is not a tenant user list or user-management endpoint.

### User role assignment

- `GET /users/:id/roles`
- `PUT /users/:id/roles`
- Permission: `rbac.user.role.manage`
- Request body for PUT: `{ roleIds: string[] }`
- Tenant scope is derived from `CurrentUser().tenantId`.

### User outlet assignment

- `GET /users/:id/outlets`
- `PUT /users/:id/outlets`
- Permission: `rbac.user.outlet.manage`
- Request body for PUT: `{ outletIds: string[] }`
- Tenant scope is derived from `CurrentUser().tenantId`.

## Confirmed Gaps

### BACKEND CONTRACT GAP

- No tenant user create endpoint or invitation contract.
- No user update endpoint.
- No user delete/deactivate endpoint.
- No user status contract.
- No user search, pagination, sorting, or filtering contract.
- Role and outlet assignment endpoints exist, but no mutation UI is included because assignment requires separate role/outlet management workflows and the user module is currently read-only.

### SECURITY GAP

- User responses intentionally exclude password, refresh tokens, sessions, tenant ownership, and authentication secrets.

### FRONTEND GAP

- Users UI is read-only until explicit create/update/deactivate contracts are added.

### TEST INFRASTRUCTURE GAP

- No frontend component test runner is configured for a Users module.

