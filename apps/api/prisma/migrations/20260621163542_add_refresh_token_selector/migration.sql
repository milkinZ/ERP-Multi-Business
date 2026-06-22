/*
  Warnings:

  - A unique constraint covering the columns `[tokenSelector]` on the table `RefreshToken` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `tokenSelector` to the `RefreshToken` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "tokenSelector" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenSelector_key" ON "RefreshToken"("tokenSelector");
