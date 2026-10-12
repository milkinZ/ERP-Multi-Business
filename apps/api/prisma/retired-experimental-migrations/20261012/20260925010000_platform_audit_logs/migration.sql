CREATE TABLE "PlatformAuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorTenantId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL DEFAULT 'PLATFORM_USER',
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "targetTenantId" TEXT,
    "requestId" TEXT,
    "correlationId" TEXT,
    "metadata" JSONB,
    "outcome" TEXT NOT NULL DEFAULT 'SUCCESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformAuditLog_createdAt_id_idx" ON "PlatformAuditLog"("createdAt", "id");
CREATE INDEX "PlatformAuditLog_action_createdAt_idx" ON "PlatformAuditLog"("action", "createdAt");
CREATE INDEX "PlatformAuditLog_resourceType_resourceId_idx" ON "PlatformAuditLog"("resourceType", "resourceId");
CREATE INDEX "PlatformAuditLog_targetTenantId_createdAt_idx" ON "PlatformAuditLog"("targetTenantId", "createdAt");
CREATE INDEX "PlatformAuditLog_actorUserId_createdAt_idx" ON "PlatformAuditLog"("actorUserId", "createdAt");

CREATE OR REPLACE FUNCTION prevent_platform_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'PlatformAuditLog records are append-only';
END;
$$;

CREATE TRIGGER platform_audit_log_append_only
BEFORE UPDATE OR DELETE ON "PlatformAuditLog"
FOR EACH ROW
EXECUTE FUNCTION prevent_platform_audit_log_mutation();