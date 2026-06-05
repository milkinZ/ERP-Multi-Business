# Cafe OS - Purchase Order API Documentation

## Authentication Flow

All API endpoints require JWT authentication. Follow these steps:

### 1. Register User
```bash
POST /api/auth/register
Content-Type: application/json

{
  "email": "manager@cafe.com",
  "password": "SecurePassword123",
  "tenantId": "tenant-id",
  "roleId": "role-id",
  "outletId": "outlet-id" // optional
}
```

### 2. Login
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "manager@cafe.com",
  "password": "SecurePassword123"
}

Response:
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 3. Use Token
Add the token to all subsequent requests:
```bash
Authorization: Bearer <accessToken>
```

## Purchase Order Endpoints

### Create Purchase Order
```bash
POST /api/purchase-orders
Authorization: Bearer <token>
Content-Type: application/json

{
  "supplierId": "supplier-id",
  "warehouseId": "warehouse-id", // optional
  "expectedDeliveryDate": "2026-06-15T00:00:00Z",
  "notes": "Rush delivery needed",
  "items": [
    {
      "inventoryItemId": "item-id-1",
      "quantity": 10,
      "unitPrice": 50000
    },
    {
      "inventoryItemId": "item-id-2",
      "quantity": 5,
      "unitPrice": 100000
    }
  ]
}

Response:
{
  "id": "po-id",
  "poNumber": "PO-202606-00001",
  "status": "DRAFT",
  "totalAmount": 1000000,
  "createdAt": "2026-06-04T10:30:00Z",
  ...
}
```

**Required Permission:** `purchase_order.create`

### List Purchase Orders
```bash
GET /api/purchase-orders?status=PENDING&skip=0&take=10
Authorization: Bearer <token>

Response:
{
  "data": [...],
  "total": 5,
  "skip": 0,
  "take": 10
}
```

**Required Permission:** `purchase_order.read`

### Get Purchase Order Details
```bash
GET /api/purchase-orders/:id
Authorization: Bearer <token>

Response:
{
  "id": "po-id",
  "poNumber": "PO-202606-00001",
  "status": "PENDING",
  "supplier": {...},
  "items": [...],
  "totalAmount": 1000000,
  ...
}
```

**Required Permission:** `purchase_order.read`

### Update Purchase Order
```bash
PATCH /api/purchase-orders/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "expectedDeliveryDate": "2026-06-20T00:00:00Z",
  "notes": "Updated delivery date"
}
```

**Note:** Can only update PO in DRAFT or PENDING status
**Required Permission:** `purchase_order.update`

### Update Purchase Order Status
```bash
PATCH /api/purchase-orders/:id/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "APPROVED"
}

Status Transitions:
- DRAFT → PENDING, CANCELLED
- PENDING → APPROVED, REJECTED, CANCELLED
- APPROVED → PARTIALLY_RECEIVED, RECEIVED
- PARTIALLY_RECEIVED → RECEIVED
- RECEIVED → COMPLETED
```

**Required Permission:** `purchase_order.approve` OR `purchase_order.receive`

### Delete Purchase Order
```bash
DELETE /api/purchase-orders/:id
Authorization: Bearer <token>
```

**Note:** Can only delete PO in DRAFT status
**Required Permission:** `purchase_order.delete`

## Purchase Order Permissions

These permissions must be assigned to user roles:

```
- purchase_order.create      - Create new PO
- purchase_order.read        - View PO
- purchase_order.update      - Edit PO details
- purchase_order.delete      - Delete PO
- purchase_order.approve     - Approve/reject PO
- purchase_order.receive     - Mark as received/completed
```

## Multi-Tenant Isolation

- All data is automatically scoped to the user's `tenantId` from JWT
- Users can only access POs created in their tenant
- No cross-tenant data leakage

## Error Responses

### Unauthorized (401)
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

### Forbidden (403)
```json
{
  "statusCode": 403,
  "message": "Missing required permissions: purchase_order.create"
}
```

### Not Found (404)
```json
{
  "statusCode": 404,
  "message": "Purchase Order not found"
}
```

### Bad Request (400)
```json
{
  "statusCode": 400,
  "message": "Can only edit PO in DRAFT or PENDING status"
}
```

## Testing with cURL

### Get Auth Token
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "manager@cafe.com",
    "password": "SecurePassword123"
  }'
```

### List Purchase Orders
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3001/api/purchase-orders
```

### Create Purchase Order
```bash
curl -X POST http://localhost:3001/api/purchase-orders \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "supplierId": "supplier-id",
    "items": [
      {
        "inventoryItemId": "item-id",
        "quantity": 10,
        "unitPrice": 50000
      }
    ]
  }'
```
