-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('CAFE', 'RETAIL', 'LAUNDRY', 'GYM', 'HOTEL');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "businessType" "BusinessType" NOT NULL DEFAULT 'CAFE';
