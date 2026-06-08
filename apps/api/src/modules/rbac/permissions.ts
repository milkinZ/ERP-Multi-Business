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
} as const;
