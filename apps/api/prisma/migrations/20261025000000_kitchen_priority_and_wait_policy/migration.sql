ALTER TABLE "SalesOrder"
ADD COLUMN "kitchenPriority" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Tenant"
ADD COLUMN "kitchenWaitThresholdMinutes" INTEGER NOT NULL DEFAULT 15;

CREATE INDEX "SalesOrder_tenantId_kitchenPriority_kitchenReleasedAt_idx"
ON "SalesOrder"("tenantId", "kitchenPriority" DESC, "kitchenReleasedAt" ASC);
