ALTER TABLE "Recipe"
ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "RecipeItem" ADD COLUMN "unit" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "unit" TEXT;
ALTER TABLE "InventoryCostLayer" ADD COLUMN "unit" TEXT;
ALTER TABLE "InventoryMovementCostAllocation" ADD COLUMN "unit" TEXT;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "unit" TEXT;
ALTER TABLE "PurchaseOrderReceiptItem" ADD COLUMN "unit" TEXT;
ALTER TABLE "InventoryPurchasePriceVariance" ADD COLUMN "unit" TEXT;
ALTER TABLE "WarehouseTransferItem" ADD COLUMN "unit" TEXT;
ALTER TABLE "WarehouseTransferReceiptItem" ADD COLUMN "unit" TEXT;
ALTER TABLE "PurchaseOrderItem"
ALTER COLUMN "unitPrice" TYPE DECIMAL(18,6)
USING "unitPrice"::DECIMAL(18,6);

UPDATE "RecipeItem" AS recipe_item
SET "unit" = inventory_item."unit"
FROM "InventoryItem" AS inventory_item
WHERE recipe_item."inventoryItemId" = inventory_item."id";

UPDATE "InventoryMovement" AS movement
SET "unit" = inventory_item."unit"
FROM "InventoryItem" AS inventory_item
WHERE movement."inventoryItemId" = inventory_item."id";

UPDATE "InventoryCostLayer" AS layer
SET "unit" = inventory_item."unit"
FROM "InventoryItem" AS inventory_item
WHERE layer."inventoryItemId" = inventory_item."id";

UPDATE "InventoryMovementCostAllocation" AS allocation
SET "unit" = movement."unit"
FROM "InventoryMovement" AS movement
WHERE allocation."movementId" = movement."id";

UPDATE "PurchaseOrderItem" AS item
SET "unit" = inventory_item."unit"
FROM "InventoryItem" AS inventory_item
WHERE item."inventoryItemId" = inventory_item."id";

UPDATE "PurchaseOrderReceiptItem" AS item
SET "unit" = inventory_item."unit"
FROM "InventoryItem" AS inventory_item
WHERE item."inventoryItemId" = inventory_item."id";

UPDATE "InventoryPurchasePriceVariance" AS variance
SET "unit" = inventory_item."unit"
FROM "InventoryItem" AS inventory_item
WHERE variance."inventoryItemId" = inventory_item."id";

UPDATE "WarehouseTransferItem" AS item
SET "unit" = inventory_item."unit"
FROM "InventoryItem" AS inventory_item
WHERE item."inventoryItemId" = inventory_item."id";

UPDATE "WarehouseTransferReceiptItem" AS item
SET "unit" = inventory_item."unit"
FROM "InventoryItem" AS inventory_item
WHERE item."inventoryItemId" = inventory_item."id";

CREATE TABLE "TenantUnitConversion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromUnit" VARCHAR(32) NOT NULL,
    "toUnit" VARCHAR(32) NOT NULL,
    "factor" DECIMAL(24,12) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TenantUnitConversion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TenantUnitConversion_factor_check" CHECK ("factor" > 0),
    CONSTRAINT "TenantUnitConversion_fromUnit_check" CHECK (length(trim("fromUnit")) > 0),
    CONSTRAINT "TenantUnitConversion_toUnit_check" CHECK (length(trim("toUnit")) > 0),
    CONSTRAINT "TenantUnitConversion_Tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TenantUnitConversion_tenantId_fromUnit_toUnit_key"
ON "TenantUnitConversion"("tenantId", "fromUnit", "toUnit");
CREATE INDEX "TenantUnitConversion_tenantId_idx"
ON "TenantUnitConversion"("tenantId");

CREATE TABLE "InventoryUnitConversion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "fromUnit" VARCHAR(32) NOT NULL,
    "toUnit" VARCHAR(32) NOT NULL,
    "factor" DECIMAL(24,12) NOT NULL,
    "convertHistory" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryUnitConversion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryUnitConversion_factor_check" CHECK ("factor" > 0),
    CONSTRAINT "InventoryUnitConversion_Tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryUnitConversion_InventoryItem_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "InventoryUnitConversion_tenantId_inventoryItemId_createdAt_idx"
ON "InventoryUnitConversion"("tenantId", "inventoryItemId", "createdAt");

CREATE TABLE "SalesOrderRecipeSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "recipeId" TEXT,
    "recipeRevision" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesOrderRecipeSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SalesOrderRecipeSnapshot_Tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalesOrderRecipeSnapshot_SalesOrderItem_fkey" FOREIGN KEY ("orderItemId") REFERENCES "SalesOrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SalesOrderRecipeSnapshot_orderItemId_key"
ON "SalesOrderRecipeSnapshot"("orderItemId");
CREATE INDEX "SalesOrderRecipeSnapshot_tenantId_createdAt_idx"
ON "SalesOrderRecipeSnapshot"("tenantId", "createdAt");

CREATE TABLE "SalesOrderRecipeSnapshotItem" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "ingredientName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "SalesOrderRecipeSnapshotItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SalesOrderRecipeSnapshotItem_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "SalesOrderRecipeSnapshotItem_Snapshot_fkey" FOREIGN KEY ("snapshotId") REFERENCES "SalesOrderRecipeSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalesOrderRecipeSnapshotItem_InventoryItem_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "SalesOrderRecipeSnapshotItem_snapshotId_idx"
ON "SalesOrderRecipeSnapshotItem"("snapshotId");
CREATE INDEX "SalesOrderRecipeSnapshotItem_inventoryItemId_idx"
ON "SalesOrderRecipeSnapshotItem"("inventoryItemId");
