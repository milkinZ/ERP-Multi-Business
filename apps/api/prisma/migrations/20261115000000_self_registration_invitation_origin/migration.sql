ALTER TABLE "UserInvitation"
  ADD COLUMN "isSelfRegistration" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "UserInvitation"
  DROP CONSTRAINT "UserInvitation_exactly_one_inviter_check";

ALTER TABLE "UserInvitation"
  ADD CONSTRAINT "UserInvitation_exactly_one_inviter_check"
  CHECK (
    (
      "isSelfRegistration" = true
      AND "invitedByUserId" IS NULL
      AND "invitedByPlatformIdentityId" IS NULL
    )
    OR
    (
      "isSelfRegistration" = false
      AND (
        ("invitedByUserId" IS NOT NULL AND "invitedByPlatformIdentityId" IS NULL)
        OR
        ("invitedByUserId" IS NULL AND "invitedByPlatformIdentityId" IS NOT NULL)
      )
    )
  );
