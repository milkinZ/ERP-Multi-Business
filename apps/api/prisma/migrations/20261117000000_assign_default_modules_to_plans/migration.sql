WITH desired_modules("planType", "moduleKey") AS (
  VALUES
    ('STARTER', 'INVENTORY'),
    ('BUSINESS', 'INVENTORY'),
    ('BUSINESS', 'PROCUREMENT'),
    ('BUSINESS', 'ANALYTICS'),
    ('ENTERPRISE', 'INVENTORY'),
    ('ENTERPRISE', 'PROCUREMENT'),
    ('ENTERPRISE', 'FINANCE'),
    ('ENTERPRISE', 'ANALYTICS')
)
DELETE FROM "PlanFeatureModule" AS assignment
USING "Plan" AS plan, "FeatureModule" AS module
WHERE assignment."planId" = plan."id"
  AND assignment."moduleId" = module."id"
  AND module."key" IN ('INVENTORY', 'PROCUREMENT', 'FINANCE', 'ANALYTICS')
  AND NOT EXISTS (
    SELECT 1
    FROM desired_modules AS desired
    WHERE desired."planType" = plan."type"::TEXT
      AND desired."moduleKey" = module."key"
  );

WITH desired_modules("planType", "moduleKey") AS (
  VALUES
    ('STARTER', 'INVENTORY'),
    ('BUSINESS', 'INVENTORY'),
    ('BUSINESS', 'PROCUREMENT'),
    ('BUSINESS', 'ANALYTICS'),
    ('ENTERPRISE', 'INVENTORY'),
    ('ENTERPRISE', 'PROCUREMENT'),
    ('ENTERPRISE', 'FINANCE'),
    ('ENTERPRISE', 'ANALYTICS')
)
INSERT INTO "PlanFeatureModule" ("planId", "moduleId")
SELECT plan."id", module."id"
FROM desired_modules AS desired
JOIN "Plan" AS plan ON plan."type"::TEXT = desired."planType"
JOIN "FeatureModule" AS module
  ON module."key" = desired."moduleKey"
  AND module."isActive" = true
ON CONFLICT ("planId", "moduleId") DO NOTHING;
