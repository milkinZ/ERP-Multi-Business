ALTER TABLE "User"
ADD COLUMN "tenantWideNotificationAccess" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Notification"
ADD COLUMN "category" VARCHAR(32),
ADD COLUMN "sourceEventId" VARCHAR(128);

CREATE UNIQUE INDEX "Notification_tenantId_userId_sourceEventId_key"
ON "Notification"("tenantId", "userId", "sourceEventId");

CREATE TABLE "NotificationPreference" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "category" VARCHAR(32) NOT NULL,
  "channel" VARCHAR(16) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationPreference_channel_check"
    CHECK ("channel" IN ('IN_APP', 'EMAIL')),
  CONSTRAINT "NotificationPreference_category_check"
    CHECK ("category" IN (
      'PRODUCTS',
      'ORDERS',
      'PAYMENTS',
      'INVENTORY',
      'PROCUREMENT',
      'KITCHEN',
      'USERS',
      'BUSINESS',
      'FEATURE_FLAGS',
      'SUBSCRIPTIONS',
      'BILLING'
    )),
  CONSTRAINT "NotificationPreference_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NotificationPreference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "NotificationPreference_tenantId_userId_category_channel_key"
ON "NotificationPreference"("tenantId", "userId", "category", "channel");

CREATE INDEX "NotificationPreference_tenantId_userId_idx"
ON "NotificationPreference"("tenantId", "userId");
