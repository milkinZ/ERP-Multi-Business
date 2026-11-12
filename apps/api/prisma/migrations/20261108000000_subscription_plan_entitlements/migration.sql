ALTER TABLE "Plan"
ADD COLUMN "maxOutlets" INTEGER,
ADD COLUMN "maxUsers" INTEGER,
ADD COLUMN "maxMonthlyOrders" INTEGER;

UPDATE "Plan"
SET
  "maxOutlets" = CASE "type"
    WHEN 'FREE' THEN 1
    WHEN 'STARTER' THEN 3
    WHEN 'BUSINESS' THEN 10
    WHEN 'ENTERPRISE' THEN NULL
  END,
  "maxUsers" = CASE "type"
    WHEN 'FREE' THEN 3
    WHEN 'STARTER' THEN 10
    WHEN 'BUSINESS' THEN 50
    WHEN 'ENTERPRISE' THEN NULL
  END,
  "maxMonthlyOrders" = CASE "type"
    WHEN 'FREE' THEN 500
    WHEN 'STARTER' THEN 5000
    WHEN 'BUSINESS' THEN 50000
    WHEN 'ENTERPRISE' THEN NULL
  END;

CREATE TABLE "SubscriptionMonthlyUsage" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "orderCount" INTEGER NOT NULL DEFAULT 0,
  "overLimitOrderCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionMonthlyUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscriptionMonthlyUsage_tenantId_periodKey_key"
ON "SubscriptionMonthlyUsage"("tenantId", "periodKey");

ALTER TABLE "SubscriptionMonthlyUsage"
ADD CONSTRAINT "SubscriptionMonthlyUsage_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
