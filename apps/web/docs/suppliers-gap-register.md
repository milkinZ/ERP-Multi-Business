# Suppliers Gap Register

Verified against the current `apps/api` Supplier, Purchase Order, Warehouse, Inventory, Prisma, and RBAC implementation.

## Supported Supplier Contract

- `GET /suppliers?page=&limit=&search=&isActive=&sortBy=&sortOrder=` with `supplier.read`: tenant-scoped page; page size defaults to 20 and is capped at 100. Search covers name, email, phone, and address. Status filtering supports active/inactive records. Sorting is restricted to name or creation time with a stable ID tie-breaker.
- `GET /suppliers/:id` with `supplier.read`: tenant-scoped detail.
- `POST /suppliers` with `supplier.create`: accepts `name`, optional `phone`, optional `email`, and optional `address`.
- `PATCH /suppliers/:id` with `supplier.update`: accepts optional `name`, `phone`, `email`, `address`, and `isActive`.
- `DELETE /suppliers/:id` with `supplier.delete`: hard-deletes an unused supplier; if any tenant Purchase Order references it, deactivates the supplier and returns `{ success: true, deactivated: true }`, preserving history.
- Supplier names are unique per tenant in Prisma.

## Backend Contract Gaps

- Supplier detail now displays a permission-gated, paginated Purchase Order history through the existing `GET /purchase-orders?supplierId=&skip=&take=` contract; the Supplier API does not duplicate PO relations or counts.
- Supplier-product, supplier-ingredient, supplier-inventory, or supplier-warehouse relations are not exposed.
- Supplier pricing, performance, spend, balances, payment/accounting, analytics, bulk import/export, and realtime events are not exposed.
- Inactive suppliers cannot be selected for new Purchase Orders. Historical Purchase Orders remain readable.
- Other model fields such as `contactPerson` and `taxNumber` are not explicit fields in the current DTO/service contract.
- No business-type capability metadata or Supplier-specific business-type behavior is exposed.

## Frontend Gaps

- Supplier detail consumes the existing tenant-scoped Purchase Order list to show Purchase Order history. Receiving metrics, spend, balances, and performance remain unavailable.
- The supplier list provides server-side search, active-status filtering, name/date sorting, and bounded pagination. Purchase Order and supplier-option selectors continue to load all options through sequential, bounded API pages to preserve access to the complete tenant catalog.
- Supplier removal confirmation explains that referenced suppliers are deactivated, while unused suppliers are deleted. The UI reports which action was applied and shows active status.

## Test Infrastructure Gap

- No frontend test runner or Supplier frontend test suite exists in `apps/web`.

## Realtime Infrastructure Gap

- No verified Supplier-specific realtime event or shared subscription contract exists.
