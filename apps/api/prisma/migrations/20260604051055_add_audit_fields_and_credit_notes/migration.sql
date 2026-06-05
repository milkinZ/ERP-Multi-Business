-- CreateEnum
CREATE TYPE "CreditNoteType" AS ENUM ('REFUND', 'RETURN', 'ADJUSTMENT', 'WARRANTY');

-- AlterTable CustomerOrder
ALTER TABLE "CustomerOrder" ADD COLUMN "createdById" TEXT;
ALTER TABLE "CustomerOrder" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "CustomerOrder" ADD COLUMN "deletedById" TEXT;
ALTER TABLE "CustomerOrder" ADD COLUMN "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CustomerOrder" ADD COLUMN "updatedById" TEXT;

-- AlterTable InventoryMovement
ALTER TABLE "InventoryMovement" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "InventoryMovement" ADD COLUMN "deletedById" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "InventoryMovement" ADD COLUMN "updatedById" TEXT;

-- AlterTable Payment
ALTER TABLE "Payment" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "deletedById" TEXT;
ALTER TABLE "Payment" ADD COLUMN "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Payment" ADD COLUMN "updatedById" TEXT;

-- AlterTable PurchaseOrder
ALTER TABLE "PurchaseOrder" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "PurchaseOrder" ADD COLUMN "deletedById" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "updatedById" TEXT;

-- CreateTable CreditNote
CREATE TABLE "CreditNote" (
  "id" TEXT NOT NULL,
  "creditNoteNumber" VARCHAR(50) NOT NULL,
  "type" "CreditNoteType" NOT NULL,
  "paymentId" TEXT,
  "orderId" TEXT,
  "tenantId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "referenceNumber" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditNote_tenantId_idx" ON "CreditNote"("tenantId");
CREATE INDEX "CreditNote_paymentId_idx" ON "CreditNote"("paymentId");
CREATE UNIQUE INDEX "CreditNote_tenantId_creditNoteNumber_key" ON "CreditNote"("tenantId", "creditNoteNumber");

-- AddForeignKey
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey Payment
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey CreditNote
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CustomerOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey InventoryMovement
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey PurchaseOrder
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
