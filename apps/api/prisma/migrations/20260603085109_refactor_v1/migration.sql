/*
  Warnings:

  - You are about to alter the column `orderNumber` on the `CustomerOrder` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to drop the column `stock` on the `Ingredient` table. All the data in the column will be lost.
  - You are about to drop the column `productId` on the `InventoryMovement` table. All the data in the column will be lost.
  - You are about to drop the column `stock` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the `IngredientMovement` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProductStock` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[tenantId,orderNumber]` on the table `CustomerOrder` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[inventoryItemId]` on the table `Ingredient` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[inventoryItemId]` on the table `Product` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,sku]` on the table `Product` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,name]` on the table `Supplier` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,code]` on the table `Warehouse` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,name]` on the table `Warehouse` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `inventoryItemId` to the `Ingredient` table without a default value. This is not possible if the table is not empty.
  - Added the required column `inventoryItemId` to the `InventoryMovement` table without a default value. This is not possible if the table is not empty.
  - Added the required column `code` to the `Warehouse` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "InventoryItemType" AS ENUM ('PRODUCT', 'INGREDIENT', 'MATERIAL', 'ASSET', 'SUPPLY', 'SERVICE');

-- AlterEnum
ALTER TYPE "BusinessType" ADD VALUE 'MANUFACTURING';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InventoryMovementType" ADD VALUE 'STOCK_OUT';
ALTER TYPE "InventoryMovementType" ADD VALUE 'PURCHASE';
ALTER TYPE "InventoryMovementType" ADD VALUE 'CONSUMPTION';
ALTER TYPE "InventoryMovementType" ADD VALUE 'PRODUCTION';
ALTER TYPE "InventoryMovementType" ADD VALUE 'TRANSFER';

-- DropForeignKey
ALTER TABLE "IngredientMovement" DROP CONSTRAINT "IngredientMovement_ingredientId_fkey";

-- DropForeignKey
ALTER TABLE "IngredientMovement" DROP CONSTRAINT "IngredientMovement_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProductStock" DROP CONSTRAINT "ProductStock_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProductStock" DROP CONSTRAINT "ProductStock_warehouseId_fkey";

-- AlterTable
ALTER TABLE "CustomerOrder" ALTER COLUMN "orderNumber" SET DATA TYPE VARCHAR(50);

-- AlterTable
ALTER TABLE "Ingredient" DROP COLUMN "stock",
ADD COLUMN     "inventoryItemId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "InventoryMovement" DROP COLUMN "productId",
ADD COLUMN     "afterQuantity" DOUBLE PRECISION,
ADD COLUMN     "beforeQuantity" DOUBLE PRECISION,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "inventoryItemId" TEXT NOT NULL,
ADD COLUMN     "referenceId" TEXT,
ADD COLUMN     "referenceType" TEXT,
ADD COLUMN     "warehouseId" TEXT,
ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "createdById" TEXT;

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "stock",
ADD COLUMN     "inventoryItemId" TEXT;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "taxNumber" TEXT;

-- AlterTable
ALTER TABLE "Warehouse" ADD COLUMN     "code" TEXT NOT NULL;

-- DropTable
DROP TABLE "IngredientMovement";

-- DropTable
DROP TABLE "ProductStock";

-- DropEnum
DROP TYPE "IngredientMovementType";

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT,
    "type" "InventoryItemType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryStock" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_tenantId_code_key" ON "InventoryItem"("tenantId", "code");

-- CreateIndex
CREATE INDEX "InventoryStock_inventoryItemId_idx" ON "InventoryStock"("inventoryItemId");

-- CreateIndex
CREATE INDEX "InventoryStock_warehouseId_idx" ON "InventoryStock"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryStock_warehouseId_inventoryItemId_key" ON "InventoryStock"("warehouseId", "inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerOrder_tenantId_orderNumber_key" ON "CustomerOrder"("tenantId", "orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_inventoryItemId_key" ON "Ingredient"("inventoryItemId");

-- CreateIndex
CREATE INDEX "InventoryMovement_tenantId_idx" ON "InventoryMovement"("tenantId");

-- CreateIndex
CREATE INDEX "InventoryMovement_inventoryItemId_idx" ON "InventoryMovement"("inventoryItemId");

-- CreateIndex
CREATE INDEX "InventoryMovement_warehouseId_idx" ON "InventoryMovement"("warehouseId");

-- CreateIndex
CREATE INDEX "InventoryMovement_referenceType_referenceId_idx" ON "InventoryMovement"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_inventoryItemId_key" ON "Product"("inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_sku_key" ON "Product"("tenantId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_tenantId_name_key" ON "Supplier"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_tenantId_code_key" ON "Warehouse"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_tenantId_name_key" ON "Warehouse"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStock" ADD CONSTRAINT "InventoryStock_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStock" ADD CONSTRAINT "InventoryStock_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
