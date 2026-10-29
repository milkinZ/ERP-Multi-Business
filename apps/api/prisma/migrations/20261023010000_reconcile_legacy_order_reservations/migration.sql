BEGIN;

UPDATE "SalesOrder"
SET
  "paidAmount" = "totalAmount",
  "paymentStatus" = 'PAID'
WHERE "status" = 'COMPLETED'
  AND "paymentStatus" <> 'PAID';

UPDATE "InventoryMovement" AS movement
SET
  "referenceType" = 'ORDER_RESERVATION_COMMITTED',
  "type" = CASE
    WHEN tenant."businessType" = 'CAFE' THEN 'CONSUMPTION'::"InventoryMovementType"
    ELSE 'SALE'::"InventoryMovementType"
  END,
  "note" = 'Reconciled completed order stock reservation'
FROM "SalesOrder" AS order_record
JOIN "Tenant" AS tenant
  ON tenant."id" = order_record."tenantId"
WHERE movement."referenceType" = 'ORDER_RESERVATION'
  AND movement."referenceId" = order_record."id"
  AND movement."tenantId" = order_record."tenantId"
  AND order_record."status" = 'COMPLETED';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "InventoryMovement" AS movement
    WHERE movement."referenceType" = 'ORDER_RESERVATION'
      AND NOT EXISTS (
        SELECT 1
        FROM "SalesOrder" AS order_record
        WHERE order_record."id" = movement."referenceId"
          AND order_record."tenantId" = movement."tenantId"
      )
  ) THEN
    RAISE EXCEPTION
      'Cannot reconcile active order reservations without a matching order';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "InventoryMovement" AS movement
    JOIN "SalesOrder" AS order_record
      ON order_record."id" = movement."referenceId"
     AND order_record."tenantId" = movement."tenantId"
    JOIN "InventoryMovementCostAllocation" AS allocation
      ON allocation."movementId" = movement."id"
    WHERE movement."referenceType" = 'ORDER_RESERVATION'
      AND order_record."status" = 'CANCELLED'
  ) THEN
    RAISE EXCEPTION
      'Cannot reconcile cancelled order reservations with cost allocations automatically';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "InventoryMovement" AS movement
    JOIN "SalesOrder" AS order_record
      ON order_record."id" = movement."referenceId"
     AND order_record."tenantId" = movement."tenantId"
    WHERE movement."referenceType" = 'ORDER_RESERVATION'
      AND order_record."status" = 'CANCELLED'
      AND movement."warehouseId" IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot reconcile cancelled order reservations without a warehouse';
  END IF;
END $$;

CREATE TEMP TABLE "_order_reservation_release_plan" ON COMMIT DROP AS
SELECT
  movement."id" AS reservation_id,
  movement."tenantId" AS tenant_id,
  movement."inventoryItemId" AS inventory_item_id,
  movement."warehouseId" AS warehouse_id,
  movement."referenceId" AS order_id,
  movement."quantity" AS quantity,
  movement."unitCost" AS unit_cost,
  movement."totalCost" AS total_cost,
  stock."id" AS stock_id,
  COALESCE(stock."quantity", 0) AS base_quantity,
  COALESCE(
    SUM(movement."quantity") OVER (
      PARTITION BY movement."warehouseId", movement."inventoryItemId"
      ORDER BY movement."createdAt", movement."id"
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ),
    0
  ) AS prior_quantity
FROM "InventoryMovement" AS movement
JOIN "SalesOrder" AS order_record
  ON order_record."id" = movement."referenceId"
 AND order_record."tenantId" = movement."tenantId"
LEFT JOIN "InventoryStock" AS stock
  ON stock."warehouseId" = movement."warehouseId"
 AND stock."inventoryItemId" = movement."inventoryItemId"
WHERE movement."referenceType" = 'ORDER_RESERVATION'
  AND order_record."status" = 'CANCELLED';

UPDATE "InventoryStock" AS stock
SET
  "quantity" = stock."quantity" + released."quantity",
  "updatedAt" = CURRENT_TIMESTAMP
FROM (
  SELECT stock_id, SUM(quantity) AS quantity
  FROM "_order_reservation_release_plan"
  WHERE stock_id IS NOT NULL
  GROUP BY stock_id
) AS released
WHERE stock."id" = released.stock_id;

INSERT INTO "InventoryStock" (
  "id",
  "warehouseId",
  "inventoryItemId",
  "quantity",
  "updatedAt"
)
SELECT
  'backfill_' || md5(warehouse_id || ':' || inventory_item_id),
  warehouse_id,
  inventory_item_id,
  SUM(quantity),
  CURRENT_TIMESTAMP
FROM "_order_reservation_release_plan"
WHERE stock_id IS NULL
GROUP BY warehouse_id, inventory_item_id
ON CONFLICT ("warehouseId", "inventoryItemId")
DO UPDATE SET
  "quantity" = "InventoryStock"."quantity" + EXCLUDED."quantity",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "InventoryMovement" (
  "id",
  "tenantId",
  "warehouseId",
  "inventoryItemId",
  "type",
  "referenceType",
  "referenceId",
  "quantity",
  "beforeQuantity",
  "afterQuantity",
  "unitCost",
  "totalCost",
  "note",
  "createdAt"
)
SELECT
  'release_' || md5(plan.reservation_id),
  plan.tenant_id,
  plan.warehouse_id,
  plan.inventory_item_id,
  'RETURN',
  'ORDER_RESERVATION_RELEASE',
  plan.order_id,
  plan.quantity,
  plan.base_quantity + plan.prior_quantity,
  plan.base_quantity + plan.prior_quantity + plan.quantity,
  plan.unit_cost,
  plan.total_cost,
  'Released stock for a previously cancelled order',
  CURRENT_TIMESTAMP
FROM "_order_reservation_release_plan" AS plan;

UPDATE "InventoryMovement" AS movement
SET
  "referenceType" = 'ORDER_RESERVATION_RELEASED',
  "note" = 'Reconciled cancelled order stock reservation'
FROM "_order_reservation_release_plan" AS plan
WHERE movement."id" = plan.reservation_id;

COMMIT;
