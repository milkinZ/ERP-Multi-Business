ALTER TABLE "User"
  ALTER COLUMN "password" DROP NOT NULL,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Role"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "systemKey" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "Role_tenantId_systemKey_key"
  ON "Role"("tenantId", "systemKey");

ALTER TABLE "RefreshToken"
  ADD COLUMN "sessionId" TEXT;

UPDATE "RefreshToken"
SET "revokedAt" = CURRENT_TIMESTAMP
WHERE "revokedAt" IS NULL;

UPDATE "Session"
SET "deletedAt" = CURRENT_TIMESTAMP
WHERE "deletedAt" IS NULL;

CREATE TABLE "UserInvitation" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "invitedByUserId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserInvitationRole" (
  "invitationId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  CONSTRAINT "UserInvitationRole_pkey" PRIMARY KEY ("invitationId", "roleId")
);

CREATE TABLE "UserInvitationOutlet" (
  "invitationId" TEXT NOT NULL,
  "outletId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  CONSTRAINT "UserInvitationOutlet_pkey" PRIMARY KEY ("invitationId", "outletId")
);

CREATE UNIQUE INDEX "UserInvitation_tokenHash_key"
  ON "UserInvitation"("tokenHash");
CREATE INDEX "UserInvitation_tenantId_email_revokedAt_acceptedAt_idx"
  ON "UserInvitation"("tenantId", "email", "revokedAt", "acceptedAt");
CREATE INDEX "UserInvitation_expiresAt_idx"
  ON "UserInvitation"("expiresAt");
CREATE INDEX "UserInvitationRole_tenantId_idx"
  ON "UserInvitationRole"("tenantId");
CREATE INDEX "UserInvitationOutlet_tenantId_idx"
  ON "UserInvitationOutlet"("tenantId");

ALTER TABLE "UserInvitation"
  ADD CONSTRAINT "UserInvitation_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "UserInvitation_invitedByUserId_fkey"
    FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UserInvitationRole"
  ADD CONSTRAINT "UserInvitationRole_invitationId_fkey"
    FOREIGN KEY ("invitationId") REFERENCES "UserInvitation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "UserInvitationRole_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "Role"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "UserInvitationRole_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserInvitationOutlet"
  ADD CONSTRAINT "UserInvitationOutlet_invitationId_fkey"
    FOREIGN KEY ("invitationId") REFERENCES "UserInvitation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "UserInvitationOutlet_outletId_fkey"
    FOREIGN KEY ("outletId") REFERENCES "Outlet"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "UserInvitationOutlet_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
