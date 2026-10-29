CREATE TYPE "InventoryReorderScope" AS ENUM ('PER_WAREHOUSE', 'TENANT_ITEM_TOTAL');
CREATE TYPE "InventoryReorderQuantityStrategy" AS ENUM ('TARGET_STOCK', 'FIXED_QUANTITY');
CREATE TYPE "InventoryReorderAction" AS ENUM ('ALERT_ONLY', 'ALERT_AND_SUGGEST');

CREATE TABLE "InventoryReorderRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "locationKey" TEXT NOT NULL,
    "scope" "InventoryReorderScope" NOT NULL,
    "quantityStrategy" "InventoryReorderQuantityStrategy" NOT NULL,
    "action" "InventoryReorderAction" NOT NULL DEFAULT 'ALERT_AND_SUGGEST',
    "reorderPoint" DOUBLE PRECISION NOT NULL,
    "targetStock" DOUBLE PRECISION,
    "fixedOrderQuantity" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryReorderRule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryReorderRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryReorderRule_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryReorderRule_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryReorderRule_reorderPoint_check" CHECK ("reorderPoint" >= 0),
    CONSTRAINT "InventoryReorderRule_location_scope_check" CHECK (
      ("scope" = 'PER_WAREHOUSE' AND "warehouseId" IS NOT NULL AND "locationKey" = "warehouseId")
      OR
      ("scope" = 'TENANT_ITEM_TOTAL' AND "warehouseId" IS NULL AND "locationKey" = 'ALL')
    ),
    CONSTRAINT "InventoryReorderRule_quantity_strategy_check" CHECK (
      ("quantityStrategy" = 'TARGET_STOCK' AND "targetStock" > "reorderPoint" AND "fixedOrderQuantity" IS NULL)
      OR
      ("quantityStrategy" = 'FIXED_QUANTITY' AND "fixedOrderQuantity" > 0 AND "targetStock" IS NULL)
    )
);

CREATE UNIQUE INDEX "InventoryReorderRule_tenantId_inventoryItemId_locationKey_key"
    ON "InventoryReorderRule"("tenantId", "inventoryItemId", "locationKey");

CREATE INDEX "InventoryReorderRule_tenantId_inventoryItemId_idx"
    ON "InventoryReorderRule"("tenantId", "inventoryItemId");
