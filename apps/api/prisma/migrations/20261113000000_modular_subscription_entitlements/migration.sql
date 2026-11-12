CREATE TYPE "SubscriptionFeatureModuleStatus" AS ENUM (
  'ACTIVE',
  'PENDING_ADD',
  'PENDING_REMOVE'
);

CREATE TABLE "FeatureModule" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "monthlyPriceCents" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeatureModule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanFeatureModule" (
  "planId" TEXT NOT NULL,
  "moduleId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanFeatureModule_pkey" PRIMARY KEY ("planId", "moduleId")
);

CREATE TABLE "SubscriptionFeatureModule" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "moduleId" TEXT NOT NULL,
  "status" "SubscriptionFeatureModuleStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionFeatureModule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeatureModule_key_key" ON "FeatureModule"("key");
CREATE INDEX "FeatureModule_isActive_name_idx" ON "FeatureModule"("isActive", "name");
CREATE INDEX "PlanFeatureModule_moduleId_idx" ON "PlanFeatureModule"("moduleId");
CREATE UNIQUE INDEX "SubscriptionFeatureModule_subscriptionId_moduleId_key"
  ON "SubscriptionFeatureModule"("subscriptionId", "moduleId");
CREATE INDEX "SubscriptionFeatureModule_tenantId_status_idx"
  ON "SubscriptionFeatureModule"("tenantId", "status");

ALTER TABLE "PlanFeatureModule"
  ADD CONSTRAINT "PlanFeatureModule_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "Plan"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanFeatureModule"
  ADD CONSTRAINT "PlanFeatureModule_moduleId_fkey"
  FOREIGN KEY ("moduleId") REFERENCES "FeatureModule"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionFeatureModule"
  ADD CONSTRAINT "SubscriptionFeatureModule_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionFeatureModule"
  ADD CONSTRAINT "SubscriptionFeatureModule_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionFeatureModule"
  ADD CONSTRAINT "SubscriptionFeatureModule_moduleId_fkey"
  FOREIGN KEY ("moduleId") REFERENCES "FeatureModule"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
