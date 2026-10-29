ALTER TABLE "Subscription"
ADD COLUMN "pendingPlanId" TEXT;

CREATE INDEX "Subscription_pendingPlanId_idx"
ON "Subscription"("pendingPlanId");

ALTER TABLE "Subscription"
ADD CONSTRAINT "Subscription_pendingPlanId_fkey"
FOREIGN KEY ("pendingPlanId") REFERENCES "Plan"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
