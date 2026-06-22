# Type Safety Hardening Report (Technical Debt)

This report was generated from the **current ESLint run** output captured to:
- `apps/api/.eslint-report.json`

## Categorization Rules
Violations were categorized by these ESLint rule groups:
- **unsafe-any**: `@typescript-eslint/no-unsafe-assignment`, `@typescript-eslint/no-unsafe-return`
- **unsafe-assignment**: `@typescript-eslint/no-unsafe-assignment`
- **unsafe-call**: `@typescript-eslint/no-unsafe-call`
- **unsafe-member-access**: `@typescript-eslint/no-unsafe-member-access`
- **unsafe-return**: `@typescript-eslint/no-unsafe-return`

> Note: Some messages are under multiple groups; for this initial report we classify by the dominant `ruleId` shown in the report.

---

## Summary Totals (From `.eslint-report.json`)
The report indicates violations across these files (partial list shown due to output size limitations):

### unsafe-any / unsafe-assignment
- `src/common/filter/http-exception.filter.ts`
  - `@typescript-eslint/no-unsafe-assignment`: 11 (fatal errors)
- `src/common/filters/http-exception.filter.ts`
  - `@typescript-eslint/no-unsafe-assignment`: 12
- `src/core/services/base.service.ts`
  - `@typescript-eslint/no-unsafe-assignment`: 2
- `src/core/request-context/request-context.middleware.ts`
  - `@typescript-eslint/no-unsafe-assignment`: 4
- `src/infrastructure/health/health.service.ts`
  - `@typescript-eslint/no-unsafe-assignment`: 2
- `src/infrastructure/logging/logger.module.ts`
  - `@typescript-eslint/no-unsafe-return`: 1
  - `@typescript-eslint/no-unsafe-call`: 1
  - `@typescript-eslint/no-unsafe-member-access`: 1
- `src/infrastructure/config/app.config.ts`
  - `@typescript-eslint/no-unused-vars` (not part of no-unsafe, but tracked)
- `src/modules/auth/jwt.strategy.ts`
  - `@typescript-eslint/no-unsafe-assignment`: 3
- `src/modules/inventory/inventory.controller.ts`
  - `@typescript-eslint/no-unsafe-argument`: 1 (warning)
- `src/modules/payments/payments.controller.ts`
  - multiple `@typescript-eslint/no-unsafe-member-access` / `no-unsafe-argument`
- `src/modules/products/products.controller.ts`
  - `no-unsafe-assignment`: 1
- `src/modules/purchase-orders/purchase-order.service.ts`
  - `no-unsafe-assignment`: multiple (notably `items.map`, `items.reduce`, `updateData: any`, `PurchaseOrderItem` mapping)
- `src/modules/rbac/permission.guard.ts`
  - `no-unsafe-assignment`: 1
- `src/modules/supplier/supplier.service.ts`
  - `no-unsafe-assignment`: 1

### unsafe-call
- `src/common/filter/http-exception.filter.ts`
  - `no-unsafe-call`: 2
- `src/core/request-context/request-context.middleware.ts`
  - `no-unsafe-call`: 2
- `src/modules/auth/jwt.strategy.ts`
  - no unsafe-call indicated in snippet; but unsafe-assignment/member-access are present
- `src/modules/purchase-orders/purchase-order.service.ts`
  - `no-unsafe-call`: 1 (e.g. `.reduce` chain usage on any)

### unsafe-member-access
- `src/common/filter/http-exception.filter.ts`
  - `no-unsafe-member-access`: `.status`, `.json`, `.url`, `.response`, `.message`
- `src/core/request-context/request-context.middleware.ts`
  - `no-unsafe-member-access`: `.headers`, `.setHeader`
- `src/common/filters/http-exception.filter.ts`
  - `no-unsafe-member-access`: `.response`, `.message`, `.status`, `.json`, `.url`
- `src/infrastructure/health/health.service.ts`
  - `no-unsafe-member-access`: `.message`
- `src/infrastructure/logging/logger.module.ts`
  - `no-unsafe-member-access`: `.headers`
- `src/modules/auth/jwt.strategy.ts`
  - `no-unsafe-member-access`: `.sub`, `.tenantId`, `.roleId`, `.outletId`, `.permissions`
- `src/modules/auth/permissions.guard.ts`
  - `no-unsafe-member-access`: `.user`
- `src/modules/payments/payments.controller.ts`
  - `no-unsafe-member-access`: `.tenantId` on `any` user
- `src/modules/products/products.controller.ts`
  - `no-unsafe-member-access`: `.tenantId` / `.user`
- `src/modules/purchase-orders/purchase-order.service.ts`
  - `no-unsafe-member-access`: `.status`, `.supplierId`, `.length`, `.reduce`, `.quantity`, `.unitPrice`, `.receivedAt`, `.completedAt`
- `src/modules/rbac/permission.guard.ts`
  - `no-unsafe-member-access`: `.user`
- `src/modules/supplier/supplier.controller.ts`
  - `no-unsafe-member-access`: `.tenantId` on `any` user
- `src/modules/warehouse/warehouse.controller.ts`
  - `no-unsafe-member-access`: `.tenantId` on `any` user

### unsafe-return
- `src/infrastructure/logging/logger.module.ts`
  - `no-unsafe-return`: 1
- `src/core/services/base.service.ts`
  - `no-unsafe-return`: 2

---

## Technical Debt Tracking Notes (Non-blocking for Foundation)
- Many `no-unsafe-*` errors originate from controller/guard layers using `any` for:
  - `user` (from decorators / jwt payload)
  - `req`/`res`/`exception` objects
  - `dto` values where runtime type mapping exists but compile-time typing is weak
- The roadmap should proceed with:
  - Foundation architecture completion
  - Prisma schema refactor (entities + relationships)
  - Redis/BullMQ/Auth/RBAC/Multi-tenant foundations
- Systematic cleanup of `no-unsafe-*` violations is deferred to:
  - **Phase: Type Safety Hardening**

---

## Files With Most Frequent no-unsafe Violations (High Priority For Later Phase)
- `src/common/filter/http-exception.filter.ts`
- `src/common/filters/http-exception.filter.ts`
- `src/common/interceptors/response.interceptor.ts`
- `src/core/request-context/request-context.middleware.ts`
- `src/core/services/base.service.ts`
- `src/infrastructure/health/health.service.ts`
- `src/infrastructure/logging/logger.module.ts`
- `src/modules/auth/jwt.strategy.ts`
- `src/modules/auth/permissions.guard.ts`
- `src/modules/payments/payments.controller.ts`
- `src/modules/products/products.controller.ts`
- `src/modules/purchase-orders/purchase-order.service.ts`
- `src/modules/purchase-orders/purchase-order.service.ts`
- `src/modules/supplier/*`
- `src/modules/warehouse/warehouse.controller.ts`

---

## How to Re-generate This Report (Later)
Re-run ESLint with JSON output and overwrite the report:

```bash
cd apps/api
npx eslint "src/**/*.ts" -f json -o .eslint-report.json
```

Then re-render this document via the same parsing strategy.


