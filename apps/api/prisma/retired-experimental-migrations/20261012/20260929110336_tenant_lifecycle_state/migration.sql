-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE';

-- Recover the latest persisted lifecycle signal where legacy suspension had
-- no tenant-column representation. A non-null deletedAt remains authoritative.
WITH outbox_lifecycle AS (
	SELECT
		CASE
			WHEN jsonb_typeof("payload") = 'string' THEN ("payload" #>> '{}')::jsonb
			ELSE "payload"
		END AS event,
		"createdAt",
		"id",
		"tenantId"
	FROM "OutboxEvent"
	WHERE "type" IN (
		'business.activated',
		'business.suspended',
		'business.archived',
		'business.restored',
		'super-admin.tenant.activated',
		'super-admin.tenant.suspended',
		'super-admin.tenant.deactivated',
		'super-admin.tenant.restored'
	)
),
lifecycle_events AS (
	SELECT
		"targetTenantId" AS tenant_id,
		"action" AS action_name,
		"createdAt" AS event_at,
		"id" AS event_id
	FROM "PlatformAuditLog"
	WHERE "action" IN (
		'super-admin.tenant.activated',
		'super-admin.tenant.suspended',
		'super-admin.tenant.deactivated',
		'super-admin.tenant.restored'
	)
		AND "targetTenantId" IS NOT NULL

	UNION ALL

	SELECT
		COALESCE(
			event #>> '{payload,targetTenantId}',
			event #>> '{payload,businessId}',
			event #>> '{payload,tenantId}',
			"tenantId"
		) AS tenant_id,
		event #>> '{type}' AS action_name,
		"createdAt" AS event_at,
		"id" AS event_id
	FROM outbox_lifecycle
),
latest_lifecycle AS (
	SELECT DISTINCT ON (tenant_id) tenant_id, action_name
	FROM lifecycle_events
	WHERE tenant_id IS NOT NULL
	ORDER BY tenant_id, event_at DESC, event_id DESC
)
UPDATE "Tenant" AS tenant
SET "status" = CASE
	WHEN tenant."deletedAt" IS NOT NULL THEN 'DEACTIVATED'::"TenantStatus"
	WHEN latest.action_name IN (
		'super-admin.tenant.deactivated',
		'business.archived'
	) THEN 'DEACTIVATED'::"TenantStatus"
	WHEN latest.action_name IN (
		'super-admin.tenant.suspended',
		'business.suspended'
	) THEN 'SUSPENDED'::"TenantStatus"
	ELSE 'ACTIVE'::"TenantStatus"
END
FROM latest_lifecycle AS latest
WHERE tenant."id" = latest.tenant_id;

UPDATE "Tenant"
SET "status" = 'DEACTIVATED'
WHERE "deletedAt" IS NOT NULL;

ALTER TABLE "Tenant"
ADD CONSTRAINT "Tenant_status_deletedAt_check"
CHECK (
	("status" = 'DEACTIVATED' AND "deletedAt" IS NOT NULL)
	OR ("status" <> 'DEACTIVATED' AND "deletedAt" IS NULL)
);
