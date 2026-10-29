CREATE TABLE "InventoryPurchasePriceVariance" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "receiptItemId" TEXT NOT NULL,
  "purchaseOrderId" TEXT NOT NULL,
  "purchaseOrderItemId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "warehouseId" TEXT,
  "quantity" DECIMAL(18, 6) NOT NULL,
  "standardUnitCost" DECIMAL(18, 6) NOT NULL,
  "actualUnitCost" DECIMAL(18, 6) NOT NULL,
  "varianceAmount" DECIMAL(18, 6) NOT NULL,
  "currencyCode" CHAR(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryPurchasePriceVariance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryPurchasePriceVariance_receiptItemId_key"
  ON "InventoryPurchasePriceVariance"("receiptItemId");
CREATE INDEX "InventoryPurchasePriceVariance_tenantId_createdAt_id_idx"
  ON "InventoryPurchasePriceVariance"("tenantId", "createdAt", "id");
CREATE INDEX "InventoryPurchasePriceVariance_tenantId_purchaseOrderId_idx"
  ON "InventoryPurchasePriceVariance"("tenantId", "purchaseOrderId");
CREATE INDEX "InventoryPurchasePriceVariance_tenantId_inventoryItemId_createdAt_idx"
  ON "InventoryPurchasePriceVariance"("tenantId", "inventoryItemId", "createdAt");

ALTER TABLE "InventoryPurchasePriceVariance"
  ADD CONSTRAINT "InventoryPurchasePriceVariance_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPurchasePriceVariance_receiptId_fkey"
    FOREIGN KEY ("receiptId") REFERENCES "PurchaseOrderReceipt"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPurchasePriceVariance_receiptItemId_fkey"
    FOREIGN KEY ("receiptItemId") REFERENCES "PurchaseOrderReceiptItem"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPurchasePriceVariance_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPurchasePriceVariance_purchaseOrderItemId_fkey"
    FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPurchasePriceVariance_inventoryItemId_fkey"
    FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPurchasePriceVariance_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
