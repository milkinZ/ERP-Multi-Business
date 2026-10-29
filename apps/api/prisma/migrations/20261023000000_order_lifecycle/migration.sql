CREATE TYPE "OrderMode" AS ENUM ('REGULAR', 'OPEN_BILL');

ALTER TABLE "SalesOrder"
  ADD COLUMN "orderMode" "OrderMode" NOT NULL DEFAULT 'REGULAR',
  ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "paidAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "kitchenReleasedAt" TIMESTAMP(3);

UPDATE "SalesOrder" AS order_record
SET
  "paidAmount" = CASE
    WHEN order_record."status" = 'PAID' THEN order_record."totalAmount"
    ELSE LEAST(
      order_record."totalAmount",
      COALESCE(
        (
          SELECT SUM(payment."amount")::INTEGER
          FROM "Payment" AS payment
          WHERE payment."orderId" = order_record."id"
            AND payment."status" = 'PAID'
        ),
        0
      )
    )
  END,
  "paymentStatus" = CASE
    WHEN order_record."status" = 'PAID' OR COALESCE(
      (
        SELECT SUM(payment."amount")
        FROM "Payment" AS payment
        WHERE payment."orderId" = order_record."id"
          AND payment."status" = 'PAID'
      ),
      0
    ) >= order_record."totalAmount" THEN 'PAID'::"PaymentStatus"
    ELSE 'PENDING'::"PaymentStatus"
  END,
  "kitchenReleasedAt" = CASE
    WHEN EXISTS (
      SELECT 1
      FROM "Tenant" AS tenant
      WHERE tenant."id" = order_record."tenantId"
        AND tenant."businessType" = 'CAFE'
    )
      AND order_record."status" IN ('IN_PROGRESS', 'READY')
      THEN order_record."createdAt"
    ELSE NULL
  END;
