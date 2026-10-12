# Purchase Orders Gap Register

Verified against the current `apps/api` Purchase Order, Supplier, Warehouse, Inventory, Prisma, and RBAC implementation.

## Supported Contract

- `GET /purchase-orders` with `purchase_order.read`; supports `status`, `supplierId`, `skip`, and `take`.
- `GET /purchase-orders/:id` with `purchase_order.read`.
- `POST /purchase-orders` with `purchase_order.create`.
- `PATCH /purchase-orders/:id` with `purchase_order.update`; service permits editing only DRAFT or PENDING records.
- `PATCH /purchase-orders/:id/status` with both `purchase_order.approve` and `purchase_order.receive` metadata; accepts a real `PurchaseOrderStatus` value.
- `DELETE /purchase-orders/:id` with `purchase_order.delete`; service permits deletion only in DRAFT status.

## Backend Contract Gaps

- No separate receiving endpoint or receipt DTO exists. Receiving is performed through status transitions.
- Partial receiving quantities are not accepted by the public status controller; `PARTIALLY_RECEIVED` currently does not advance received quantities in the service path.
- No cancellation-specific endpoint exists; cancellation uses the status endpoint.
- No search, date filtering, sorting, or cursor pagination exists.
- No PO-specific receiving history, accounting, payment, tax, discount, currency, attachments, or supplier performance API exists.
- No Purchase Order realtime event consumer exists in the web application.

## Frontend Gaps

- The UI cannot provide explicit receipt quantity entry because the backend status endpoint accepts only a status.
- Status actions are limited to transitions supported by the backend state machine.
- List pagination controls are not added; the API contract supports skip/take but the current screen uses the first backend page.

## Safety Notes

- Receiving is never retried automatically and is not performed through Inventory endpoints from the frontend.
- Inventory mutation, movement creation, serializable transaction behavior, and idempotency remain backend-owned.

## Test Infrastructure Gap

- No frontend test runner or Purchase Order frontend test suite exists in `apps/web`.

## Realtime Infrastructure Gap

- No verified Purchase Order realtime subscription contract exists.
