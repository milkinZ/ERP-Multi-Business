CREATE TYPE "ProductStockMode" AS ENUM ('INVENTORY_ITEM', 'RECIPE', 'UNTRACKED');

ALTER TABLE "Product"
ADD COLUMN "stockMode" "ProductStockMode" NOT NULL DEFAULT 'UNTRACKED';

UPDATE "Product" AS product
SET "stockMode" = 'INVENTORY_ITEM'
WHERE product."inventoryItemId" IS NOT NULL;

UPDATE "Product" AS product
SET "stockMode" = 'RECIPE'
WHERE product."inventoryItemId" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "Recipe" AS recipe
    WHERE recipe."productId" = product."id"
      AND recipe."tenantId" = product."tenantId"
  );

ALTER TABLE "SalesOrderRecipeSnapshotItem"
ADD COLUMN "inventoryUnit" TEXT NOT NULL DEFAULT '';

UPDATE "SalesOrderRecipeSnapshotItem" AS snapshot_item
SET "inventoryUnit" = COALESCE(
  NULLIF(inventory_item."unit", ''),
  snapshot_item."unit"
)
FROM "InventoryItem" AS inventory_item
WHERE inventory_item."id" = snapshot_item."inventoryItemId";
