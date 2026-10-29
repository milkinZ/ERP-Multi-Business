# Warehouses Gap Register

Verified against the current `apps/api` Warehouse, Inventory, Purchase Order, Supplier, Outlet, Prisma, and RBAC implementation.

## Supported Contract

- `POST /warehouses` with `warehouse.create`; accepts `name` and optional `outletId`. The backend generates `id` and `code`.
- `GET /warehouses` with `warehouse.read`; returns tenant-scoped warehouse rows ordered by creation date.
- `GET /warehouses/:id` with `warehouse.read`; returns a tenant-scoped warehouse aggregate.
- `GET /warehouses/:id/stocks` with `warehouse.read`; returns a bounded, paginated, searchable list of stock per inventory item and unit, with tenant ownership enforced for both warehouse and inventory items.
- `GET /inventory/history?warehouseId=:id` with `inventory.read`; returns paginated movement history after validating the warehouse belongs to the authenticated tenant.
- `PATCH /warehouses/:id` with `warehouse.update`; updates `name` and/or `outletId`, and never changes the server-generated warehouse code. An empty outlet ID clears the association and returns the warehouse to tenant-wide scope.
- `PATCH /warehouses/:id` can deactivate or reactivate a warehouse through `isActive`; inactive warehouses remain visible for historical review.
- `DELETE /warehouses/:id` with `warehouse.delete`; permanently removes a warehouse only when it has no stock, movements, purchase orders, or transfer history, and otherwise deactivates it.
- Warehouse names and codes have Prisma unique constraints per tenant.
- Warehouse creation and outlet reassignment validate that the referenced outlet is active and belongs to the authenticated tenant; the ownership check and mutation run in a serializable transaction.

## Resolved Gap

- Warehouse transfers are implemented through the Inventory API and Inventory workspace, including cross-outlet transfers within one tenant, atomic shipment, partial receipts, and idempotent retries. The focused PostgreSQL suite previously passed 10 tests. The last full API integration run, before the Warehouse lifecycle changes, reported 16 passing and 6 failing suites (87 passing and 20 failing tests), including health, billing, order payments, queue, outbox, and Redis; this run does not establish a clean full-suite gate.
- Warehouse lifecycle is implemented: unused warehouses can be removed, while referenced warehouses are deactivated to preserve history. Inactive warehouses cannot be used for new manual stock movements, Purchase Orders, or transfers, and can be reactivated by a user with `warehouse.update`.

## Backend Contract Gaps

- InventoryStock lookup is exposed for a specific warehouse and the detail UI displays on-hand quantity per item and unit. Totals across unlike units, inventory value, and availability calculations are not provided.
- Transfers are exposed by the Inventory API rather than Warehouse routes: create, list/detail, ship, partial/full receipt, and pending cancellation. Shipments deduct source stock atomically; receipts credit destination stock.
- Outlet list/selector integration is not part of the current Warehouse frontend contract; create/update accept an optional outlet ID that is validated against the authenticated tenant.
- Warehouse analytics, valuation, capacity, manager, scheduling, bulk import/export, and realtime events are not exposed.
- The Warehouse API does not expose business-type capability metadata or an explicit business-type restriction.

## Integration Notes

- `Warehouse` relates to `InventoryStock`, `InventoryMovement`, and `PurchaseOrder` in Prisma.
- Inventory mutations validate warehouse ownership and remain authoritative for quantities and movements.
- Purchase Order receiving requires a warehouse and applies inventory changes inside its own backend transaction.
- No direct Warehouse-Supplier relation exists.
- No Warehouse-specific fulfillment mutation exists; fulfillment operates through Inventory and order workflows.

## Frontend Gaps

- The Warehouse master-data UI displays warehouse details and outlet ID, supports permission-gated create/update, and provides searchable, paginated per-item stock and movement-history views. Movement history additionally requires `inventory.read`. A separate Inventory transfer workspace displays transfer status, shipped/received/remaining quantities, and receipt history.
- The UI does not calculate or display warehouse stock totals, available quantities, inventory value, or analytics.
- Warehouse status and permission-gated lifecycle controls are available; the UI explains whether removal deleted an unused warehouse or deactivated a referenced warehouse.

## Test Infrastructure Gap

- No frontend test runner or Warehouse frontend test suite exists in `apps/web`.

## Realtime Infrastructure Gap

- No verified Warehouse-specific realtime event or shared subscription contract exists.
