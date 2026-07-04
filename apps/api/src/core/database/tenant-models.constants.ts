// Derived from apps/api/prisma/schema.prisma
// Used for automatic tenant/outlet isolation in Prisma middleware.

export const TENANT_SCOPED_MODELS = [
  // Tenant-scoped models (have tenantId field in schema)
  'Ingredient',
  'InventoryItem',
  'InventoryMovement',
  'Product',
  'PurchaseOrder',
  'PurchaseOrderItem',
  'Recipe',
  'RecipeItem',
  'RefreshToken',
  'Role',
  'RolePermission',
  'SalesOrder',
  'SalesOrderItem',
  'Supplier',
  'Tenant',
  'User',
  'Warehouse',
  'OutboxEvent',
  'DeadLetterJob',
  'Session',
  'AuditLog',
  'Notification',
  'FeatureFlag',
  'Subscription',
  'Invoice',
  'UserRole',
  'UserOutlet',
] as const;

export const OUTLET_SCOPED_MODELS = [
  // Outlet-scoped models (have outletId field in schema)
  'Product',
  'SalesOrder',
  'RefreshToken',
  'Session',
  'Warehouse',
  'AuditLog',
  'Notification',
  'OutboxEvent',
  'DeadLetterJob',
] as const;

// Models that do NOT contain tenantId directly, but are tenant-owned through relations.
// Middleware MUST enforce ownership by joining/validating relation ownership.
// export const RELATION_SCOPED_MODELS = ['InventoryStock', 'Payment'] as const;

export const GLOBAL_MODELS = [
  // Must never receive tenant/outlet injection.
  // Permission and Plan are explicitly global in requirements.
  'Permission',
  'Plan',
] as const;

export type TenantScopedModel = (typeof TENANT_SCOPED_MODELS)[number];

export type OutletScopedModel = (typeof OUTLET_SCOPED_MODELS)[number];
export type GlobalModel = (typeof GLOBAL_MODELS)[number];
