-- CreateEnum
CREATE TYPE "PlatformAdminRole" AS ENUM ('READ_ONLY', 'OPERATIONS', 'PLATFORM_ADMIN');

-- AlterTable
ALTER TABLE "PlatformAuditLog" ADD COLUMN     "actorPlatformIdentityId" TEXT,
ALTER COLUMN "actorUserId" DROP NOT NULL,
ALTER COLUMN "actorTenantId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "PlatformIdentity" (
    "id" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "role" "PlatformAdminRole" NOT NULL,
    "email" TEXT,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSession" (
    "id" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformIdentity_disabledAt_role_idx" ON "PlatformIdentity"("disabledAt", "role");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformIdentity_issuer_subject_key" ON "PlatformIdentity"("issuer", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformSession_tokenHash_key" ON "PlatformSession"("tokenHash");

-- CreateIndex
CREATE INDEX "PlatformSession_identityId_revokedAt_idx" ON "PlatformSession"("identityId", "revokedAt");

-- CreateIndex
CREATE INDEX "PlatformSession_expiresAt_idx" ON "PlatformSession"("expiresAt");

-- CreateIndex
CREATE INDEX "PlatformAuditLog_actorPlatformIdentityId_createdAt_idx" ON "PlatformAuditLog"("actorPlatformIdentityId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlatformAuditLog" ADD CONSTRAINT "PlatformAuditLog_actorPlatformIdentityId_fkey" FOREIGN KEY ("actorPlatformIdentityId") REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformSession" ADD CONSTRAINT "PlatformSession_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "PlatformIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add platform identity attribution to subscription history.
ALTER TABLE "SubscriptionHistory" ADD COLUMN "actorPlatformIdentityId" TEXT;

CREATE INDEX "SubscriptionHistory_actorPlatformIdentityId_createdAt_idx"
ON "SubscriptionHistory"("actorPlatformIdentityId", "createdAt");

ALTER TABLE "SubscriptionHistory"
ADD CONSTRAINT "SubscriptionHistory_actorPlatformIdentityId_fkey"
FOREIGN KEY ("actorPlatformIdentityId") REFERENCES "PlatformIdentity"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
