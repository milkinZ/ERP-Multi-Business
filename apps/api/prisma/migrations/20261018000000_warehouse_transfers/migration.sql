CREATE TYPE "WarehouseTransferStatus" AS ENUM (
    'PENDING',
    'IN_TRANSIT',
    'PARTIALLY_RECEIVED',
    'RECEIVED',
    'CANCELLED'
);

CREATE TABLE "WarehouseTransfer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceWarehouseId" TEXT NOT NULL,
    "destinationWarehouseId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "shippedById" TEXT,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "status" "WarehouseTransferStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shippedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),

    CONSTRAINT "WarehouseTransfer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WarehouseTransferItem" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "receivedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "WarehouseTransferItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WarehouseTransferItem_quantity_positive_check" CHECK ("quantity" > 0),
    CONSTRAINT "WarehouseTransferItem_received_quantity_check" CHECK ("receivedQuantity" >= 0 AND "receivedQuantity" <= "quantity")
);

CREATE TABLE "WarehouseTransferReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehouseTransferReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WarehouseTransferReceiptItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "transferItemId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "receivedQuantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "WarehouseTransferReceiptItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WarehouseTransferReceiptItem_received_quantity_positive_check" CHECK ("receivedQuantity" > 0)
);

CREATE UNIQUE INDEX "WarehouseTransfer_tenantId_idempotencyKey_key"
ON "WarehouseTransfer"("tenantId", "idempotencyKey");

CREATE INDEX "WarehouseTransfer_tenantId_status_createdAt_idx"
ON "WarehouseTransfer"("tenantId", "status", "createdAt");

CREATE INDEX "WarehouseTransfer_sourceWarehouseId_status_idx"
ON "WarehouseTransfer"("sourceWarehouseId", "status");

CREATE INDEX "WarehouseTransfer_destinationWarehouseId_status_idx"
ON "WarehouseTransfer"("destinationWarehouseId", "status");

CREATE UNIQUE INDEX "WarehouseTransferItem_transferId_inventoryItemId_key"
ON "WarehouseTransferItem"("transferId", "inventoryItemId");

CREATE INDEX "WarehouseTransferItem_inventoryItemId_idx"
ON "WarehouseTransferItem"("inventoryItemId");

CREATE UNIQUE INDEX "WarehouseTransferReceipt_transferId_idempotencyKey_key"
ON "WarehouseTransferReceipt"("transferId", "idempotencyKey");

CREATE INDEX "WarehouseTransferReceipt_tenantId_transferId_createdAt_idx"
ON "WarehouseTransferReceipt"("tenantId", "transferId", "createdAt");

CREATE UNIQUE INDEX "WarehouseTransferReceiptItem_receiptId_transferItemId_key"
ON "WarehouseTransferReceiptItem"("receiptId", "transferItemId");

CREATE INDEX "WarehouseTransferReceiptItem_tenantId_receiptId_idx"
ON "WarehouseTransferReceiptItem"("tenantId", "receiptId");

CREATE INDEX "WarehouseTransferReceiptItem_transferItemId_idx"
ON "WarehouseTransferReceiptItem"("transferItemId");

ALTER TABLE "WarehouseTransfer"
ADD CONSTRAINT "WarehouseTransfer_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WarehouseTransfer"
ADD CONSTRAINT "WarehouseTransfer_sourceWarehouseId_fkey"
FOREIGN KEY ("sourceWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WarehouseTransfer"
ADD CONSTRAINT "WarehouseTransfer_destinationWarehouseId_fkey"
FOREIGN KEY ("destinationWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WarehouseTransfer"
ADD CONSTRAINT "WarehouseTransfer_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WarehouseTransfer"
ADD CONSTRAINT "WarehouseTransfer_shippedById_fkey"
FOREIGN KEY ("shippedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WarehouseTransferItem"
ADD CONSTRAINT "WarehouseTransferItem_transferId_fkey"
FOREIGN KEY ("transferId") REFERENCES "WarehouseTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WarehouseTransferItem"
ADD CONSTRAINT "WarehouseTransferItem_inventoryItemId_fkey"
FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WarehouseTransferReceipt"
ADD CONSTRAINT "WarehouseTransferReceipt_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WarehouseTransferReceipt"
ADD CONSTRAINT "WarehouseTransferReceipt_transferId_fkey"
FOREIGN KEY ("transferId") REFERENCES "WarehouseTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WarehouseTransferReceipt"
ADD CONSTRAINT "WarehouseTransferReceipt_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WarehouseTransferReceiptItem"
ADD CONSTRAINT "WarehouseTransferReceiptItem_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WarehouseTransferReceiptItem"
ADD CONSTRAINT "WarehouseTransferReceiptItem_receiptId_fkey"
FOREIGN KEY ("receiptId") REFERENCES "WarehouseTransferReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WarehouseTransferReceiptItem"
ADD CONSTRAINT "WarehouseTransferReceiptItem_transferItemId_fkey"
FOREIGN KEY ("transferItemId") REFERENCES "WarehouseTransferItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WarehouseTransferReceiptItem"
ADD CONSTRAINT "WarehouseTransferReceiptItem_inventoryItemId_fkey"
FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
