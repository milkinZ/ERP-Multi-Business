CREATE TYPE "InventoryValuationMethod" AS ENUM (
  'FIFO',
  'MOVING_WEIGHTED_AVERAGE',
  'STANDARD_COST'
);

CREATE TYPE "MovingAverageScope" AS ENUM (
  'PER_WAREHOUSE',
  'PER_ITEM'
);

ALTER TABLE "InventoryItem"
  ADD COLUMN "valuationMethod" "InventoryValuationMethod",
  ADD COLUMN "movingAverageScope" "MovingAverageScope",
  ADD COLUMN "standardCost" DECIMAL(18, 6),
  ADD COLUMN "averageUnitCost" DECIMAL(18, 6),
  ADD COLUMN "valuationLockedAt" TIMESTAMP(3);

ALTER TABLE "InventoryStock"
  ADD COLUMN "averageUnitCost" DECIMAL(18, 6);

ALTER TABLE "InventoryMovement"
  ADD COLUMN "unitCost" DECIMAL(18, 6),
  ADD COLUMN "totalCost" DECIMAL(18, 6);

CREATE TABLE "InventoryCostLayer" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "warehouseId" TEXT,
  "sourceMovementId" TEXT,
  "sourceType" TEXT NOT NULL,
  "sourceReferenceId" TEXT,
  "receivedQuantity" DECIMAL(18, 6) NOT NULL,
  "remainingQuantity" DECIMAL(18, 6) NOT NULL,
  "unitCost" DECIMAL(18, 6) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryCostLayer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryMovementCostAllocation" (
  "id" TEXT NOT NULL,
  "movementId" TEXT NOT NULL,
  "costLayerId" TEXT,
  "quantity" DECIMAL(18, 6) NOT NULL,
  "unitCost" DECIMAL(18, 6) NOT NULL,
  CONSTRAINT "InventoryMovementCostAllocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InventoryCostLayer_tenantId_inventoryItemId_warehouseId_createdAt_id_idx"
  ON "InventoryCostLayer"("tenantId", "inventoryItemId", "warehouseId", "createdAt", "id");
CREATE INDEX "InventoryCostLayer_sourceType_sourceReferenceId_idx"
  ON "InventoryCostLayer"("sourceType", "sourceReferenceId");
CREATE INDEX "InventoryMovementCostAllocation_movementId_idx"
  ON "InventoryMovementCostAllocation"("movementId");
CREATE INDEX "InventoryMovementCostAllocation_costLayerId_idx"
  ON "InventoryMovementCostAllocation"("costLayerId");

ALTER TABLE "InventoryCostLayer"
  ADD CONSTRAINT "InventoryCostLayer_inventoryItemId_fkey"
    FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryCostLayer_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryCostLayer_sourceMovementId_fkey"
    FOREIGN KEY ("sourceMovementId") REFERENCES "InventoryMovement"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryMovementCostAllocation"
  ADD CONSTRAINT "InventoryMovementCostAllocation_movementId_fkey"
    FOREIGN KEY ("movementId") REFERENCES "InventoryMovement"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryMovementCostAllocation_costLayerId_fkey"
    FOREIGN KEY ("costLayerId") REFERENCES "InventoryCostLayer"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
