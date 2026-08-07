export const PERMISSIONS = {
  PRODUCT_CREATE: 'product.create',
  PRODUCT_READ: 'product.read',
  PRODUCT_UPDATE: 'product.update',
  PRODUCT_DELETE: 'product.delete',

  ORDER_CREATE: 'order.create',
  ORDER_READ: 'order.read',
  ORDER_UPDATE: 'order.update',

  INVENTORY_READ: 'inventory.read',
  INVENTORY_ADJUST: 'inventory.adjust',

  REPORT_READ: 'report.read',

  PAYMENT_CREATE: 'payment.create',
  PAYMENT_READ: 'payment.read',

  ANALYTICS_READ: 'analytics.read',

  KITCHEN_READ: 'kitchen.read',
  KITCHEN_UPDATE: 'kitchen.update',

  RECIPE_CREATE: 'recipe.create',
  RECIPE_READ: 'recipe.read',
  RECIPE_UPDATE: 'recipe.update',

  INGREDIENT_CREATE: 'ingredient.create',
  INGREDIENT_READ: 'ingredient.read',
  INGREDIENT_UPDATE: 'ingredient.update',

  WAREHOUSE_READ: 'warehouse.read',
  WAREHOUSE_UPDATE: 'warehouse.update',
  WAREHOUSE_CREATE: 'warehouse.create',
  WAREHOUSE_DELETE: 'warehouse.delete',

  SUPPLIER_CREATE: 'supplier.create',
  SUPPLIER_READ: 'supplier.read',
  SUPPLIER_UPDATE: 'supplier.update',
  SUPPLIER_DELETE: 'supplier.delete',

  STOCK_CREATE: 'stock.create',
  STOCK_READ: 'stock.read',
  STOCK_UPDATE: 'stock.update',
  STOCK_DELETE: 'stock.delete',

  // Purchase Order (Purchase Orders Controller)
  PURCHASE_ORDER_CREATE: 'purchase_order.create',
  PURCHASE_ORDER_READ: 'purchase_order.read',
  PURCHASE_ORDER_UPDATE: 'purchase_order.update',
  PURCHASE_ORDER_DELETE: 'purchase_order.delete',
  PURCHASE_ORDER_APPROVE: 'purchase_order.approve',
  PURCHASE_ORDER_RECEIVE: 'purchase_order.receive',

  // Admin
  QUEUE_VIEW: 'queue.view',

  // RBAC management permissions (Phase 8)
  PERMISSION_READ: 'rbac.permission.read',
  ROLE_READ: 'rbac.role.read',
  ROLE_CREATE: 'rbac.role.create',
  ROLE_UPDATE: 'rbac.role.update',
  ROLE_DELETE: 'rbac.role.delete',
  ROLE_PERMISSION_MANAGE: 'rbac.role.permission.manage',
  USER_ROLE_MANAGE: 'rbac.user.role.manage',
  USER_OUTLET_MANAGE: 'rbac.user.outlet.manage',

  // Feature Flags
  FEATURE_FLAG_READ: 'feature-flag.read',
  FEATURE_FLAG_CREATE: 'feature-flag.create',
  FEATURE_FLAG_UPDATE: 'feature-flag.update',
  FEATURE_FLAG_DELETE: 'feature-flag.delete',
  FEATURE_FLAG_EVALUATE: 'feature-flag.evaluate',
  FEATURE_FLAG_MANAGE_GLOBAL: 'feature-flag.manage.global',

  // Business Registry
  BUSINESS_READ: 'business.read',
  BUSINESS_CREATE: 'business.create',
  BUSINESS_UPDATE: 'business.update',
  BUSINESS_DELETE: 'business.delete',
  BUSINESS_MANAGE: 'business.manage',
  BUSINESS_RESTORE: 'business.restore',

  // Subscription & Billing
  SUBSCRIPTION_READ: 'subscription.read',
  SUBSCRIPTION_CREATE: 'subscription.create',
  SUBSCRIPTION_UPDATE: 'subscription.update',
  SUBSCRIPTION_CANCEL: 'subscription.cancel',
  PLAN_READ: 'plan.read',
  PLAN_CREATE: 'plan.create',
  PLAN_UPDATE: 'plan.update',
  PLAN_DELETE: 'plan.delete',
  INVOICE_READ: 'invoice.read',
  INVOICE_CREATE: 'invoice.create',
  BILLING_READ: 'billing.read',
  BILLING_EXECUTE: 'billing.execute',

  // Super Admin (global, highest privilege)
  SUPER_ADMIN_READ: 'super-admin.read',
  SUPER_ADMIN_MANAGE_TENANTS: 'super-admin.manage.tenants',
  SUPER_ADMIN_MANAGE_PLANS: 'super-admin.manage.plans',
  SUPER_ADMIN_MANAGE_SUBSCRIPTIONS: 'super-admin.manage.subscriptions',
  SUPER_ADMIN_MANAGE_BILLING: 'super-admin.manage.billing',
  SUPER_ADMIN_MANAGE_FEATURE_FLAGS: 'super-admin.manage.feature-flags',
  SUPER_ADMIN_MANAGE_SYSTEM: 'super-admin.manage.system',
} as const;
