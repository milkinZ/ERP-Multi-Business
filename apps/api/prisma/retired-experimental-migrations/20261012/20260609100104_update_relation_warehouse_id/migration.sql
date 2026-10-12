-- DropForeignKey
ALTER TABLE "InventoryStock" DROP CONSTRAINT "InventoryStock_warehouseId_fkey";

-- AlterTable
ALTER TABLE "InventoryStock" ALTER COLUMN "warehouseId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "InventoryStock" ADD CONSTRAINT "InventoryStock_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
