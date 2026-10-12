# Warehouses Gap Register

Verified against the current `apps/api` Warehouse, Inventory, Purchase Order, Supplier, Outlet, Prisma, and RBAC implementation.

## Supported Contract

- `POST /warehouses` with `warehouse.create`; accepts `name` and optional `outletId`. The backend generates `id` and `code`.
- `GET /warehouses` with `warehouse.read`; returns tenant-scoped warehouse rows ordered by creation date.
- `GET /warehouses/:id` with `warehouse.read`; returns a tenant-scoped warehouse aggregate.
- Warehouse names and codes have Prisma unique constraints per tenant.

## Backend Contract Gaps

- Warehouse update is not exposed despite an internal repository update method.
- Warehouse delete/deactivation is not exposed.
- Warehouse-level stock summary is not exposed.
- Warehouse-specific InventoryStock lookup is not exposed by the Warehouse controller.
- Warehouse-specific InventoryMovement lookup is not exposed by the Warehouse controller.
- Warehouse transfer workflow is not exposed; the Inventory movement enum alone does not provide a transfer endpoint.
- Outlet list/selector integration is not part of the current Warehouse frontend contract; the create DTO accepts a raw optional `outletId`.
- Warehouse analytics, valuation, capacity, manager, scheduling, bulk import/export, and realtime events are not exposed.
- The Warehouse API does not expose business-type capability metadata or an explicit business-type restriction.

## Integration Notes

- `Warehouse` relates to `InventoryStock`, `InventoryMovement`, and `PurchaseOrder` in Prisma.
- Inventory mutations validate warehouse ownership and remain authoritative for quantities and movements.
- Purchase Order receiving requires a warehouse and applies inventory changes inside its own backend transaction.
- No direct Warehouse-Supplier relation exists.
- No Warehouse-specific fulfillment mutation exists; fulfillment operates through Inventory and order workflows.

## Frontend Gaps

- The UI displays warehouse master data and outlet ID only.
- It does not calculate or display stock totals, available quantities, inventory value, transfer status, or analytics.
- Update/delete controls are intentionally absent because their HTTP contracts do not exist.

## Test Infrastructure Gap

- No frontend test runner or Warehouse frontend test suite exists in `apps/web`.

## Realtime Infrastructure Gap

- No verified Warehouse-specific realtime event or shared subscription contract exists.
