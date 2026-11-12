CREATE TABLE "PurchaseOrderReturn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "createdById" TEXT,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "note" TEXT,
    "creditAmount" DECIMAL(18,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseOrderReturn_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PurchaseOrderReturn_creditAmount_nonnegative" CHECK ("creditAmount" >= 0)
);

CREATE TABLE "PurchaseOrderReturnItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "purchaseOrderItemId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "unitPrice" DECIMAL(18,6) NOT NULL,
    "creditAmount" DECIMAL(18,6) NOT NULL,
    CONSTRAINT "PurchaseOrderReturnItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PurchaseOrderReturnItem_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "PurchaseOrderReturnItem_creditAmount_nonnegative" CHECK ("creditAmount" >= 0)
);

CREATE UNIQUE INDEX "PurchaseOrderReturn_purchaseOrderId_idempotencyKey_key"
    ON "PurchaseOrderReturn"("purchaseOrderId", "idempotencyKey");
CREATE INDEX "PurchaseOrderReturn_tenantId_purchaseOrderId_createdAt_idx"
    ON "PurchaseOrderReturn"("tenantId", "purchaseOrderId", "createdAt");
CREATE INDEX "PurchaseOrderReturnItem_tenantId_returnId_idx"
    ON "PurchaseOrderReturnItem"("tenantId", "returnId");
CREATE INDEX "PurchaseOrderReturnItem_purchaseOrderItemId_idx"
    ON "PurchaseOrderReturnItem"("purchaseOrderItemId");

ALTER TABLE "PurchaseOrderReturn"
    ADD CONSTRAINT "PurchaseOrderReturn_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderReturn"
    ADD CONSTRAINT "PurchaseOrderReturn_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderReturn"
    ADD CONSTRAINT "PurchaseOrderReturn_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrderReturnItem"
    ADD CONSTRAINT "PurchaseOrderReturnItem_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderReturnItem"
    ADD CONSTRAINT "PurchaseOrderReturnItem_returnId_fkey"
    FOREIGN KEY ("returnId") REFERENCES "PurchaseOrderReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderReturnItem"
    ADD CONSTRAINT "PurchaseOrderReturnItem_purchaseOrderItemId_fkey"
    FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderReturnItem"
    ADD CONSTRAINT "PurchaseOrderReturnItem_inventoryItemId_fkey"
    FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
