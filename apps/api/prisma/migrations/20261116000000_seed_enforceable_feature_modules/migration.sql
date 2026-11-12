INSERT INTO "FeatureModule" (
  "id",
  "key",
  "name",
  "description",
  "monthlyPriceCents",
  "isActive",
  "updatedAt"
)
VALUES
  (
    'feature-module-inventory',
    'INVENTORY',
    'Inventory',
    'Inventory, ingredients, recipes, and warehouse operations',
    0,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'feature-module-procurement',
    'PROCUREMENT',
    'Procurement',
    'Supplier and purchase order operations',
    0,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'feature-module-finance',
    'FINANCE',
    'Finance',
    'Accounting and supplier accounts payable',
    0,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'feature-module-analytics',
    'ANALYTICS',
    'Analytics',
    'Analytics and reporting',
    0,
    true,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("key") DO NOTHING;
