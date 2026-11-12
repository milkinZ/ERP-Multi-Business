CREATE TABLE "SupplierItemOffer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "supplierSku" VARCHAR(100),
    "unit" VARCHAR(32) NOT NULL,
    "unitPrice" DECIMAL(18,6) NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "minimumOrderQuantity" DECIMAL(18,6),
    "leadTimeDays" INTEGER,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplierItemOffer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SupplierItemOffer_unitPrice_nonnegative" CHECK ("unitPrice" >= 0),
    CONSTRAINT "SupplierItemOffer_minimumOrderQuantity_positive" CHECK ("minimumOrderQuantity" IS NULL OR "minimumOrderQuantity" > 0),
    CONSTRAINT "SupplierItemOffer_leadTimeDays_nonnegative" CHECK ("leadTimeDays" IS NULL OR "leadTimeDays" >= 0),
    CONSTRAINT "SupplierItemOffer_validity_range" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom")
);

CREATE INDEX "SupplierItemOffer_tenantId_supplierId_inventoryItemId_effectiveFrom_effectiveTo_idx"
    ON "SupplierItemOffer"("tenantId", "supplierId", "inventoryItemId", "effectiveFrom", "effectiveTo");
CREATE INDEX "SupplierItemOffer_tenantId_inventoryItemId_idx"
    ON "SupplierItemOffer"("tenantId", "inventoryItemId");

ALTER TABLE "SupplierItemOffer"
    ADD CONSTRAINT "SupplierItemOffer_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierItemOffer"
    ADD CONSTRAINT "SupplierItemOffer_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierItemOffer"
    ADD CONSTRAINT "SupplierItemOffer_inventoryItemId_fkey"
    FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
