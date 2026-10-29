# Purchase Orders Gap Register

Verified against the current `apps/api` Purchase Order, Supplier, Warehouse, Inventory, Prisma, and RBAC implementation.

## Supported Contract

- `GET /purchase-orders` with `purchase_order.read`; supports `status`, `supplierId`, `skip`, `take`, search by PO number/supplier name/email, inclusive creation-date filters, and allowlisted sort fields/direction.
- `GET /purchase-orders/:id` with `purchase_order.read`.
- `GET /purchase-orders/:id/receipts` with `purchase_order.read`; returns tenant-scoped, paginated receipt history.
- `GET /purchase-orders/price-variances` with `purchase_order.read`; returns tenant-scoped, date-filterable and paginated standard-cost receipt variances, with totals grouped by currency and accounting status `NOT_POSTED`.
- `POST /purchase-orders` with `purchase_order.create`.
- `POST /purchase-orders/:id/receipts` with `purchase_order.receive` and a required `Idempotency-Key`; receipt quantities are incremental for that delivery.
- `PATCH /purchase-orders/:id` with `purchase_order.update`; service permits editing only DRAFT or PENDING records.
- `PATCH /purchase-orders/:id/status` with both `purchase_order.approve` and `purchase_order.receive` metadata; cannot be used to mark an order received without recording receipt quantities.
- `DELETE /purchase-orders/:id` with `purchase_order.delete`; service permits deletion only in DRAFT status.
- Each new PO snapshots the tenant's configured ISO 4217 base currency. The base currency is required before creating a PO and cannot be changed after a tenant financial transaction exists.

Receipt processing locks the tenant-scoped PO row and atomically persists the receipt header and lines, received quantities, inventory stock and movements, any standard-cost purchase-price variance snapshots, PO status, and outbox event. Variance is calculated as `(actual PO unit price - standard unit cost) × received quantity`, using the standard cost captured at receipt. A repeated key with the same normalized payload returns the existing receipt without duplicating inventory or variance records; a repeated key with a different payload conflicts. Over-receipt is rejected. The PO moves to `PARTIALLY_RECEIVED` or `RECEIVED` according to cumulative line quantities.

Inactive suppliers cannot be used to create new Purchase Orders or assigned during Purchase Order edits; existing Purchase Order history remains available after supplier deactivation.

## Implementation Status

Partial PO receiving and standard-cost purchase-price variance reporting are implemented. At implementation time, the base-currency and variance migrations were applied to `cafe_os_test`; the then-current 60-migration status on configured databases is historical. The dedicated `cafe_os_order_lifecycle_test` database now has all 62 repository migrations and passes migration-status and schema-drift checks. A PostgreSQL 18 backup/restore rehearsal on an isolated clone also passed those checks. Production `cafe_os` migration/schema status is unknown and it was not accessed; current evidence is documented in [API testing](../../api/TESTING.md). Focused variance validation passed PO PostgreSQL integration (11 tests), PO service unit (8 tests), Prisma schema validation, monorepo build, lint, and typecheck. The latest full API validation also passed 102 unit suites / 452 tests, 24 integration suites / 130 tests, and 7 E2E suites / 23 tests. Remaining items below describe separate product or test-infrastructure gaps, not blockers in the receipt or variance workflows.

## Backend Contract Gaps

- No cancellation-specific endpoint exists; cancellation uses the status endpoint.
- Cursor pagination is not exposed; offset pagination is bounded to 100 rows per request.
- Variance records are operational only and are not posted to accounting; no accounting module or posting contract exists. No PO-specific payment, tax, discount, attachments, or supplier performance API exists. FX conversion and mixed-currency purchasing are not supported.
- No Purchase Order realtime event consumer exists in the web application.

## Frontend Gaps

- Receipt quantities and optional notes can be entered; receipt history supports backend-driven pagination.
- PO totals display using the currency snapshot; unit-price inputs are labeled as tenant base-currency amounts.
- Status actions are limited to transitions supported by the backend state machine.
- The Purchase Order list uses bounded backend skip/take pagination, search, inclusive creation-date filters, and deterministic sorting. Cursor pagination remains unavailable.

## Safety Notes

- Receipt submission is not retried automatically; a retry with unchanged quantities reuses its idempotency key, including after a page reload in the same browser tab. After an unknown result, users should retry without changing the quantities or verify receipt history first.
- Inventory mutation, movement creation, durable idempotency, and outbox persistence are backend-owned. Receipt and lifecycle transitions lock the PostgreSQL PO row and verify the expected prior state before changing it.

## Test Infrastructure Gap

- No frontend test runner or Purchase Order frontend test suite exists in `apps/web`.
- The focused PostgreSQL Purchase Order integration suite passes 1 suite / 11 tests, including partial standard-cost receipts, variance report aggregation, idempotent replay, and tenant isolation. PO service unit tests pass 8 tests. The latest full API integration suite passes 24 suites / 130 tests.

## Realtime Infrastructure Gap

- No verified Purchase Order realtime subscription contract exists.
