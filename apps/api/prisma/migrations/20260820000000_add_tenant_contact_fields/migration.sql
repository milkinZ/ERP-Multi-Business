-- Keep the migrated database schema aligned with the Tenant Prisma model.
ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "contactEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "contactPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "address" TEXT;
