# ERP Multi-Business API - Refactoring Architecture

## Objectives
- Compliance with ERP standards (SAP/Oracle-like structure)
- Multi-business (Café, Retail, Laundry, Hotel, etc.) support
- SaaS multi-tenant with subscription billing
- Document-based workflows
- Complete audit trails
- Financial GL integration ready

## Core Architecture Principles

### 1. Document-Based Workflows
Each major module follows document lifecycle:
```
DRAFT → PENDING/SUBMITTED → APPROVED/REJECTED → IN_PROGRESS → COMPLETED/CANCELLED
```

Documents:
- **Purchase Order** (PO)
- **Goods Receipt Note** (GRN)
- **Sales Order** (Customer Order)
- **Invoice**
- **Credit Note** (Refund)

### 2. Generic Reservation System
Decoupled from orders - supports:
- Sales Order reservations
- Production reservations
- Transfer Order reservations
- Inter-company reservations

### 3. Multi-Warehouse Support
- Stock transfer between warehouses
- Warehouse receipts
- Physical inventory counts
- ABC analysis

### 4. Audit Trail & Soft Delete
Base service with:
- createdBy, createdAt, updatedBy, updatedAt
- deletedBy, deletedAt (soft delete)
- All transaction tables have audit fields

### 5. Financial GL Ready
- Chart of Accounts (CoA) structure
- Posting rules per document type
- Variance accounting (PO price vs Receipt)
- Cost allocation

## Refactoring Sequence

### Phase 1: Core Infrastructure (Days 1-2)
1. **Base Service** with soft delete, audit trails
2. **Generic Reservation Service** (decouple from orders)
3. **Financial Service** stub (GL posting ready)
4. **Common DTOs** (for update operations)

### Phase 2: Critical Modules (Days 2-3)
1. **Payment Module** - Add refunds, partial payments
2. **Purchase Order Module** - Complete GRN workflow
3. **Inventory Module** - Use generic reservations

### Phase 3: Missing Implementations (Days 3-4)
1. **RBAC Module** - Role/permission CRUD
2. **Missing Controllers** - Fulfillment, Users, Analytics
3. **State Machines** - Proper workflows

### Phase 4: Cross-Module Compliance (Day 4)
1. Add soft delete to all modules
2. Add audit trails to all transactions
3. Type safety improvements
4. Documentation

## Module Structure Template

```
module-name/
├── dto/
│   ├── create-{entity}.dto.ts
│   ├── update-{entity}.dto.ts
│   ├── list-{entity}.dto.ts
│   └── index.ts
├── entities/
│   ├── {entity}.entity.ts
│   └── {entity}-status.enum.ts
├── services/
│   ├── {module}.service.ts
│   └── {module}-workflow.service.ts (if complex)
├── {module}.controller.ts
└── {module}.module.ts
```

## Database Enhancements Needed

### Audit Fields (all transaction tables)
```prisma
createdById    String?
createdBy      User?     @relation(fields: [createdById])
updatedById    String?
updatedBy      User?     @relation(fields: [updatedById])
deletedById    String?
deletedBy      User?     @relation(fields: [deletedById])
createdAt      DateTime  @default(now())
updatedAt      DateTime  @updatedAt
deletedAt      DateTime?
```

### Document Reference Pattern
```prisma
referenceType  String?   // "PO", "ORDER", "GRN"
referenceId    String?
lineNumber     Int?      // For document lines
```

## API Response Standards

### Success Response
```json
{
  "statusCode": 200,
  "message": "Operation successful",
  "data": { /* entity data */ },
  "meta": {
    "timestamp": "2026-06-04T10:30:00Z",
    "tenantId": "tenant-id"
  }
}
```

### Paginated Response
```json
{
  "statusCode": 200,
  "data": [ /* items */ ],
  "pagination": {
    "total": 100,
    "skip": 0,
    "take": 10,
    "pages": 10
  }
}
```

### Error Response
```json
{
  "statusCode": 400,
  "error": "BAD_REQUEST",
  "message": "Descriptive error message",
  "errors": [ /* field-level errors */ ],
  "timestamp": "2026-06-04T10:30:00Z"
}
```

## Permission Model for ERP

### Master Data
```
master_data.create/read/update/delete
- products
- suppliers
- customers (future)
- chart_of_accounts (future)
```

### Transactions
```
transaction.{module}.create/read/update/approve/reject/cancel
- purchase_order
- purchase_order.approve
- purchase_order.receive (GRN)
- sales_order
- sales_order.cancel
- payment
- payment.refund
- inventory.transfer
- inventory.adjust
```

### Analytics
```
analytics.read
report.{report_name}.read
```

## Key Improvements from Analysis

### Before (Current State)
❌ Inventory reservation coupled to orders
❌ No payment refunds
❌ No RBAC CRUD
❌ Incomplete PO workflow
❌ Missing controllers
❌ No audit trails
❌ `any` types in code

### After (Refactored)
✅ Generic reservation system
✅ Complete payment lifecycle
✅ Full RBAC management
✅ Document-based PO → GRN workflow
✅ All controllers implemented
✅ Audit trails on all transactions
✅ Strict TypeScript with proper DTOs
✅ Soft delete everywhere
✅ Proper state machines
✅ ERP standard compliance
