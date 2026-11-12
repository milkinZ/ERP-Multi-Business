ALTER TABLE "PurchaseOrderReturnItem"
    ADD COLUMN "receiptItemId" TEXT,
    ADD COLUMN "inventoryCost" DECIMAL(18,6);

ALTER TABLE "PurchaseOrderReturnItem"
    ADD CONSTRAINT "PurchaseOrderReturnItem_receiptItemId_fkey"
    FOREIGN KEY ("receiptItemId") REFERENCES "PurchaseOrderReceiptItem"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "PurchaseOrderReturnItem_receiptItemId_idx"
    ON "PurchaseOrderReturnItem"("receiptItemId");
