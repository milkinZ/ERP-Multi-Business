ALTER TABLE "Invoice"
ADD COLUMN "billingPeriodKey" TEXT;

CREATE UNIQUE INDEX "Invoice_billingPeriodKey_key"
ON "Invoice"("billingPeriodKey");
