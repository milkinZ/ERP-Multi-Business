# Suppliers Gap Register

Verified against the current `apps/api` Supplier, Purchase Order, Warehouse, Inventory, Prisma, and RBAC implementation.

## Supported Supplier Contract

- `GET /suppliers` with `supplier.read`: tenant-scoped list ordered by `createdAt` descending.
- `GET /suppliers/:id` with `supplier.read`: tenant-scoped detail.
- `POST /suppliers` with `supplier.create`: accepts `name`, optional `phone`, optional `email`, and optional `address`.
- `PATCH /suppliers/:id` with `supplier.update`: accepts optional `name`, `phone`, `email`, and `address`.
- `DELETE /suppliers/:id` with `supplier.delete`: tenant-scoped deletion returning `{ success: true }`.
- Supplier names are unique per tenant in Prisma.

## Backend Contract Gaps

- Supplier search, filtering, sorting, and pagination are not exposed.
- Supplier detail does not include Purchase Order relations or counts.
- Supplier-product, supplier-ingredient, supplier-inventory, or supplier-warehouse relations are not exposed.
- Supplier pricing, performance, spend, balances, payment/accounting, analytics, bulk import/export, and realtime events are not exposed.
- Supplier deactivation is not exposed; the Prisma model includes fields not returned or handled by the current Supplier DTO/service contract.
- No business-type capability metadata or Supplier-specific business-type behavior is exposed.

## Frontend Gaps

- The UI cannot show Purchase Order history or receiving metrics because no Supplier endpoint returns them.
- The UI does not provide search, filtering, sorting, or pagination because the backend does not support those query contracts.
- Delete errors from referenced Purchase Orders are surfaced when the backend rejects the operation; no client-side relationship calculation is performed.

## Test Infrastructure Gap

- No frontend test runner or Supplier frontend test suite exists in `apps/web`.

## Realtime Infrastructure Gap

- No verified Supplier-specific realtime event or shared subscription contract exists.
