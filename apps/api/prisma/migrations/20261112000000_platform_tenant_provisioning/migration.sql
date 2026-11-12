ALTER TABLE "UserInvitation"
  ALTER COLUMN "invitedByUserId" DROP NOT NULL,
  ADD COLUMN "invitedByPlatformIdentityId" TEXT;

ALTER TABLE "UserInvitation"
  ADD CONSTRAINT "UserInvitation_invitedByPlatformIdentityId_fkey"
  FOREIGN KEY ("invitedByPlatformIdentityId")
  REFERENCES "PlatformIdentity"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "UserInvitation"
  ADD CONSTRAINT "UserInvitation_exactly_one_inviter_check"
  CHECK (
    ("invitedByUserId" IS NOT NULL AND "invitedByPlatformIdentityId" IS NULL)
    OR
    ("invitedByUserId" IS NULL AND "invitedByPlatformIdentityId" IS NOT NULL)
  );

CREATE INDEX "UserInvitation_invitedByPlatformIdentityId_idx"
  ON "UserInvitation"("invitedByPlatformIdentityId");
