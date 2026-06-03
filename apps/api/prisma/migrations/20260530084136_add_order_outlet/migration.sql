-- AlterTable
ALTER TABLE "CustomerOrder" ADD COLUMN     "outletId" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "outletId" TEXT;

-- AddForeignKey
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
