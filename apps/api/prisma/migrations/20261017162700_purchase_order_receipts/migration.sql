CREATE TABLE "PurchaseOrderReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "createdById" TEXT,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "statusAfter" "PurchaseOrderStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseOrderReceiptItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "purchaseOrderItemId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "receivedQuantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PurchaseOrderReceiptItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PurchaseOrderReceipt_purchaseOrderId_idempotencyKey_key"
ON "PurchaseOrderReceipt"("purchaseOrderId", "idempotencyKey");

CREATE INDEX "PurchaseOrderReceipt_tenantId_purchaseOrderId_createdAt_idx"
ON "PurchaseOrderReceipt"("tenantId", "purchaseOrderId", "createdAt");

CREATE UNIQUE INDEX "PurchaseOrderReceiptItem_receiptId_purchaseOrderItemId_key"
ON "PurchaseOrderReceiptItem"("receiptId", "purchaseOrderItemId");

CREATE INDEX "PurchaseOrderReceiptItem_tenantId_receiptId_idx"
ON "PurchaseOrderReceiptItem"("tenantId", "receiptId");

CREATE INDEX "PurchaseOrderReceiptItem_purchaseOrderItemId_idx"
ON "PurchaseOrderReceiptItem"("purchaseOrderItemId");

ALTER TABLE "PurchaseOrderReceipt"
ADD CONSTRAINT "PurchaseOrderReceipt_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrderReceipt"
ADD CONSTRAINT "PurchaseOrderReceipt_purchaseOrderId_fkey"
FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrderReceipt"
ADD CONSTRAINT "PurchaseOrderReceipt_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrderReceiptItem"
ADD CONSTRAINT "PurchaseOrderReceiptItem_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrderReceiptItem"
ADD CONSTRAINT "PurchaseOrderReceiptItem_receiptId_fkey"
FOREIGN KEY ("receiptId") REFERENCES "PurchaseOrderReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrderReceiptItem"
ADD CONSTRAINT "PurchaseOrderReceiptItem_purchaseOrderItemId_fkey"
FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrderReceiptItem"
ADD CONSTRAINT "PurchaseOrderReceiptItem_inventoryItemId_fkey"
FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
