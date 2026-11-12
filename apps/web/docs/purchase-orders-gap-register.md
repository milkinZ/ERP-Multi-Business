# Purchase Orders Gap Register

Verified against the current `apps/api` Purchase Order, Supplier, Warehouse, Inventory, Prisma, and RBAC implementation.

## Supported Contract

- `GET /purchase-orders` with `purchase_order.read`; supports `status`, `supplierId`, `skip`, `take`, search by PO number/supplier name/email, inclusive creation-date filters, and allowlisted sort fields/direction.
- `GET /purchase-orders/:id` with `purchase_order.read`.
- `GET /purchase-orders/:id/receipts` with `purchase_order.read`; returns tenant-scoped, paginated receipt history.
- `GET /purchase-orders/:id/returns` with `purchase_order.read`; returns tenant-scoped, paginated return history and cumulative returned quantities by PO item.
- `GET /purchase-orders/:id/returnable-receipt-items` with `purchase_order.read`; returns receipt lines with received, returned, and remaining quantities for return selection.
- `GET /purchase-orders/price-variances` with `purchase_order.read`; returns tenant-scoped, date-filterable and paginated standard-cost receipt variances, with totals grouped by currency and accounting status `NOT_POSTED`.
- `POST /purchase-orders` with `purchase_order.create`.
- `POST /purchase-orders/:id/receipts` with `purchase_order.receive` and a required `Idempotency-Key`; receipt quantities are incremental for that delivery.
- `POST /purchase-orders/:id/returns` with `purchase_order.receive` and a required `Idempotency-Key`; each line references a specific Goods Receipt item, can return only its received quantity not previously returned, and requires unreserved stock in the receiving warehouse.
- `POST /purchase-orders/:id/cancel` with `purchase_order.update`; cancels an order before receipt or cancels the unreceived remainder after partial receipt.
- `PATCH /purchase-orders/:id` with `purchase_order.update`; service permits editing only DRAFT or PENDING records.
- `PATCH /purchase-orders/:id/status` with both `purchase_order.approve` and `purchase_order.receive` metadata; cannot be used to mark an order received without recording receipt quantities.
- `DELETE /purchase-orders/:id` with `purchase_order.delete`; service permits deletion only in DRAFT status.
- Each new PO snapshots the tenant's configured ISO 4217 base currency. The base currency is required before creating a PO and cannot be changed after a tenant financial transaction exists.

Receipt processing locks the tenant-scoped PO row and atomically persists the receipt header and lines, received quantities, inventory stock and movements, any standard-cost purchase-price variance snapshots, PO status, and outbox event. Variance is calculated as `(actual PO unit price - standard unit cost) × received quantity`, using the standard cost captured at receipt. A repeated key with the same normalized payload returns the existing receipt without duplicating inventory or variance records; a repeated key with a different payload conflicts. Over-receipt is rejected. The PO moves to `PARTIALLY_RECEIVED` or `RECEIVED` according to cumulative line quantities.

Return processing locks the tenant-scoped PO row and each inventory item/stock row. Each return line references a specific Goods Receipt item, so quantity limits and return history are attributable to the original receipt rather than only the PO line. It rejects quantities above that receipt item's received quantity less prior returns, and rejects returns when available (unreserved) warehouse stock is insufficient. Stock-out movements and cost allocations use the configured Inventory valuation method; return headers snapshot the PO currency and a pre-tax supplier credit amount. Return records, receipt-item links, stock changes, movements, cost allocations, and the outbox event are committed atomically. Replaying a matching idempotency key/payload does not return stock twice; reusing the key with a different payload conflicts.

Inactive suppliers cannot be used to create new Purchase Orders or assigned during Purchase Order edits; existing Purchase Order history remains available after supplier deactivation.

## Implementation Status

Partial PO receiving, standard-cost purchase-price variance reporting, cancellation, and supplier returns are implemented. The return schema migrations were applied only to the isolated `cafe_os_test` database. Production `cafe_os` was not accessed. Historical migration and suite totals below describe earlier validation runs and are not current status evidence.

## Backend Contract Gaps

- Cursor pagination is not exposed; offset pagination is bounded to 100 rows per request.
- Variance records are operational only and are not posted to accounting; no accounting module or posting contract exists. No PO-specific payment, tax, discount, attachments, or supplier performance API exists. FX conversion and mixed-currency purchasing are not supported.
- No Purchase Order realtime event consumer exists in the web application.

## Frontend Gaps

- Receipt and supplier-return quantities and optional notes can be entered; both histories support backend-driven pagination. Return entry displays received, previously returned, and remaining returnable quantities.
- Cancellation is explicit, confirmation-gated, and labels cancellation after partial receipt as cancellation of the unreceived remainder.
- PO totals display using the currency snapshot; unit-price inputs are labeled as tenant base-currency amounts.
- Status actions are limited to transitions supported by the backend state machine.
- The Purchase Order list uses bounded backend skip/take pagination, search, inclusive creation-date filters, and deterministic sorting. Cursor pagination remains unavailable.

## Safety Notes

- Receipt and return submissions are not retried automatically; a retry with unchanged quantities reuses its idempotency key, including after a page reload in the same browser tab. After an unknown result, users should retry unchanged or verify the matching history first.
- Inventory mutation, movement creation, durable idempotency, and outbox persistence are backend-owned. Receipt, return, and lifecycle transitions lock the PostgreSQL PO row and verify the expected state before changing it.

## Test Infrastructure Gap

- `apps/web` has a shared Vitest runner; PO API client tests cover idempotent return submission, history pagination/query keys, and cancellation routing.
- The focused PostgreSQL Purchase Order integration suite passes 1 suite / 13 tests, including cancellation before/after partial receipt, stock return availability, valuation, idempotent replay, and tenant isolation. PO service unit tests pass 10 tests.

## Realtime Infrastructure Gap

- No verified Purchase Order realtime subscription contract exists.
