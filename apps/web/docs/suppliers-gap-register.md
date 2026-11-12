# Suppliers Gap Register

Verified against the current `apps/api` Supplier, Purchase Order, Warehouse, Inventory, Prisma, and RBAC implementation.

## Supported Supplier Contract

- `GET /suppliers?page=&limit=&search=&isActive=&sortBy=&sortOrder=` with `supplier.read`: tenant-scoped page; page size defaults to 20 and is capped at 100. Search covers name, email, phone, and address. Status filtering supports active/inactive records. Sorting is restricted to name or creation time with a stable ID tie-breaker.
- `GET /suppliers/:id` with `supplier.read`: tenant-scoped detail.
- `POST /suppliers` with `supplier.create`: accepts `name`, optional `phone`, `email`, `address`, `contactPerson`, and `taxNumber`.
- `PATCH /suppliers/:id` with `supplier.update`: accepts optional `name`, `phone`, `email`, `address`, `contactPerson`, `taxNumber`, and `isActive`. Optional text fields can be cleared by submitting an empty value.
- `DELETE /suppliers/:id` with `supplier.delete`: hard-deletes an unused supplier; if any tenant Purchase Order references it, deactivates the supplier and returns `{ success: true, deactivated: true }`, preserving history.
- `GET /suppliers/:id/offers` requires `supplier.read` and `inventory.read`; returns a tenant-scoped, paginated, effective-date-filterable Supplier item-offer catalog.
- `POST /suppliers/:id/offers` requires `supplier.update` and `inventory.read`; records supplier SKU, item unit, unit price/currency snapshot, MOQ, lead time, and validity start.
- `PATCH /suppliers/:id/offers/:offerId/validity` requires `supplier.update` and `inventory.read`; sets the exclusive end of an offer's `[effectiveFrom, effectiveTo)` validity range.
- Supplier names are unique per tenant in Prisma. Search includes contact person and tax number.
- Overlapping offer periods for the same supplier and inventory item are rejected under transaction locks; offers must use the inventory item's base unit.

## Backend Contract Gaps

- Supplier detail now displays a permission-gated, paginated Purchase Order history through the existing `GET /purchase-orders?supplierId=&skip=&take=` contract; the Supplier API does not duplicate PO relations or counts.
- Supplier-product, supplier-ingredient, supplier-inventory, or supplier-warehouse relations are not exposed.
- Supplier pricing, performance, spend, balances, payment/accounting, analytics, bulk import/export, and realtime events are not exposed.
- Inactive suppliers cannot be selected for new Purchase Orders. Historical Purchase Orders remain readable.
- Supplier offers are available with effective dating, pricing, SKU, MOQ, and lead-time snapshots; offers with overlapping periods or non-base inventory units are rejected.
- Supplier purchasing-unit conversions, quote comparison, spend analytics, and offer-derived Purchase Order automation are not available.
- No business-type capability metadata or Supplier-specific business-type behavior is exposed.

## Frontend Gaps

- Supplier detail consumes the existing tenant-scoped Purchase Order list to show Purchase Order history. Receiving metrics, spend, balances, and performance remain unavailable.
- Supplier detail includes a paginated offer workspace; Purchase Order entry can apply the price of an offer valid at the current time. Offer history is retained when validity is closed.
- The supplier list provides server-side search, active-status filtering, name/date sorting, and bounded pagination. Purchase Order and supplier-option selectors continue to load all options through sequential, bounded API pages to preserve access to the complete tenant catalog.
- Supplier removal confirmation explains that referenced suppliers are deactivated, while unused suppliers are deleted. The UI reports which action was applied and shows active status.

## Test Infrastructure Gap

- A shared frontend test runner is configured, but dedicated Supplier offer component tests do not exist yet. PostgreSQL Supplier profile/offer lifecycle tests and API unit tests cover the backend contract.

## Realtime Infrastructure Gap

- No verified Supplier-specific realtime event or shared subscription contract exists.
