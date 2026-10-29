CREATE TABLE "SubscriptionHistory" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'SYSTEM',
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionHistory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SubscriptionHistory_subscriptionId_fkey"
        FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SubscriptionHistory_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "SubscriptionHistory_tenantId_subscriptionId_createdAt_id_idx"
ON "SubscriptionHistory"("tenantId", "subscriptionId", "createdAt", "id");
