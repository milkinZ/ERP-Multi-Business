# Outlets Gap Register

## Implemented Contract

- `GET /outlets` with `outlet.read`
- `GET /outlets/:id` with `outlet.read`
- `POST /outlets` with `outlet.create`; body `{ name }`
- `PUT /outlets/:id` with `outlet.update`; body `{ name? }`
- `DELETE /outlets/:id` with `outlet.delete`; soft-deletes the tenant outlet

## Ownership and Safe Fields

- Outlet belongs to a tenant through `tenantId`.
- Tenant is derived from request context, never from frontend input.
- Safe response fields are `id`, `tenantId`, `name`, `createdAt`, and `updatedAt`.
- No outlet status, code, address, phone, email, or generated operational metadata exists in the verified response contract.

## Confirmed Gaps

### BACKEND CONTRACT GAP

- No outlet search, pagination, sorting, status, or filtering contract.
- No outlet switching endpoint.
- No outlet-specific analytics or operational summary endpoint.
- No outlet detail relationship payload for users, warehouses, orders, inventory, payments, or kitchen.
- No dedicated outlet mutation DTO for deactivation; DELETE is the verified soft-delete operation.

### SECURITY GAP

- Outlet controller previously had only JWT protection. It now uses explicit `outlet.read/create/update/delete` permissions and the RBAC seeder includes those codes.

### OPERATIONAL GAP

- User-outlet assignment remains separate under `/users/:id/outlets`; no user selector or assignment UI is added to Outlets.
- Current session `outletId` is read-only context; no switcher is implemented because no switching contract exists.

### TEST INFRASTRUCTURE GAP

- No frontend component test runner is configured for Outlets.