/*
  Warnings:

  - You are about to drop the column `deletedAt` on the `InventoryMovement` table. All the data in the column will be lost.
  - You are about to drop the column `deletedById` on the `InventoryMovement` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `InventoryMovement` table. All the data in the column will be lost.
  - You are about to drop the column `updatedById` on the `InventoryMovement` table. All the data in the column will be lost.
  - You are about to drop the column `deletedAt` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `deletedById` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `updatedById` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the `CreditNote` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CustomerOrder` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CustomerOrderItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PurchaseOrder` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PurchaseOrderItem` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "CreditNote" DROP CONSTRAINT "CreditNote_createdById_fkey";

-- DropForeignKey
ALTER TABLE "CreditNote" DROP CONSTRAINT "CreditNote_orderId_fkey";

-- DropForeignKey
ALTER TABLE "CreditNote" DROP CONSTRAINT "CreditNote_paymentId_fkey";

-- DropForeignKey
ALTER TABLE "CreditNote" DROP CONSTRAINT "CreditNote_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "CreditNote" DROP CONSTRAINT "CreditNote_updatedById_fkey";

-- DropForeignKey
ALTER TABLE "CustomerOrder" DROP CONSTRAINT "CustomerOrder_createdById_fkey";

-- DropForeignKey
ALTER TABLE "CustomerOrder" DROP CONSTRAINT "CustomerOrder_deletedById_fkey";

-- DropForeignKey
ALTER TABLE "CustomerOrder" DROP CONSTRAINT "CustomerOrder_outletId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerOrder" DROP CONSTRAINT "CustomerOrder_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerOrder" DROP CONSTRAINT "CustomerOrder_updatedById_fkey";

-- DropForeignKey
ALTER TABLE "CustomerOrderItem" DROP CONSTRAINT "CustomerOrderItem_orderId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerOrderItem" DROP CONSTRAINT "CustomerOrderItem_productId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_deletedById_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_updatedById_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_deletedById_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_orderId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_updatedById_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_createdById_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_deletedById_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_supplierId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_updatedById_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_warehouseId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrderItem" DROP CONSTRAINT "PurchaseOrderItem_inventoryItemId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrderItem" DROP CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey";

-- AlterTable
ALTER TABLE "InventoryMovement" DROP COLUMN "deletedAt",
DROP COLUMN "deletedById",
DROP COLUMN "updatedAt",
DROP COLUMN "updatedById";

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "deletedAt",
DROP COLUMN "deletedById",
DROP COLUMN "updatedAt",
DROP COLUMN "updatedById";

-- DropTable
DROP TABLE "CreditNote";

-- DropTable
DROP TABLE "CustomerOrder";

-- DropTable
DROP TABLE "CustomerOrderItem";

-- DropTable
DROP TABLE "PurchaseOrder";

-- DropTable
DROP TABLE "PurchaseOrderItem";

-- DropEnum
DROP TYPE "CreditNoteType";

-- DropEnum
DROP TYPE "PurchaseOrderStatus";

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" VARCHAR(50) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "totalAmount" INTEGER NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,

    CONSTRAINT "SalesOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_tenantId_orderNumber_key" ON "SalesOrder"("tenantId", "orderNumber");

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
