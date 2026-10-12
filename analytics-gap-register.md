# Analytics gap register

## Backend contract audit

Verified backend contract in the repo:

- `GET /analytics/summary`
- `GET /analytics/top-products`

These are guarded by `JwtAuthGuard` and `PermissionGuard`, and require the `analytics.read` permission.

## Verified response contract

### Summary response

```json
{
  "totalProducts": 150,
  "totalOrders": 1200,
  "paidOrders": 980,
  "completedOrders": 850,
  "cancelledOrders": 50,
  "totalPayments": 900,
  "totalRevenue": 12500000,
  "averageOrderValue": 14500,
  "pendingOrders": 200
}
```

### Top products response

```json
{
  "items": [
    { "productId": "prod_abc123", "name": "Espresso", "qtySold": 450 }
  ]
}
```

## Confirmed gaps

### BACKEND CONTRACT GAP
- No dashboard summary beyond the summary endpoint exists.
- No report endpoints beyond summary and top-products exist in the current analytics module.
- No dedicated financial metrics beyond total revenue and average order value are exposed.
- No report export endpoint exists in the current analytics contract.
- No analytics-specific realtime contract exists in the backend module.
- No currency code or financial breakdown fields are exposed by the backend response schema.

### FRONTEND GAP
- The existing ERP dashboard was using static or aggregated data from unrelated modules rather than the verified analytics endpoints.

### REALTIME GAP
- No WebSocket gateway or analytics event stream was found in the repo.

### ARCHITECTURE GAP
- No backend-provided drill-down or report-detail route exists beyond the summary and top-products endpoints.
