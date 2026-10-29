ALTER TABLE "Payment"
  ADD COLUMN "providerReferenceId" TEXT,
  ADD COLUMN "providerPaymentRequestId" TEXT,
  ADD COLUMN "providerPaymentId" TEXT,
  ADD COLUMN "providerEventId" TEXT,
  ADD COLUMN "providerStatus" TEXT;

ALTER TABLE "Invoice"
  ADD COLUMN "providerReferenceId" TEXT,
  ADD COLUMN "providerPaymentRequestId" TEXT,
  ADD COLUMN "providerPaymentId" TEXT,
  ADD COLUMN "providerEventId" TEXT,
  ADD COLUMN "providerStatus" TEXT;

CREATE UNIQUE INDEX "Payment_providerReferenceId_key" ON "Payment"("providerReferenceId");
CREATE UNIQUE INDEX "Payment_providerPaymentRequestId_key" ON "Payment"("providerPaymentRequestId");
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");
CREATE UNIQUE INDEX "Payment_providerEventId_key" ON "Payment"("providerEventId");
CREATE UNIQUE INDEX "Invoice_providerReferenceId_key" ON "Invoice"("providerReferenceId");
CREATE UNIQUE INDEX "Invoice_providerPaymentRequestId_key" ON "Invoice"("providerPaymentRequestId");
CREATE UNIQUE INDEX "Invoice_providerPaymentId_key" ON "Invoice"("providerPaymentId");
CREATE UNIQUE INDEX "Invoice_providerEventId_key" ON "Invoice"("providerEventId");

CREATE TABLE "XenditWebhookReceipt" (
  "id" TEXT NOT NULL,
  "idempotencyKey" VARCHAR(64) NOT NULL,
  "paymentRequestId" TEXT,
  "paymentId" TEXT NOT NULL,
  "referenceId" TEXT,
  "eventType" TEXT NOT NULL,
  "paymentStatus" TEXT NOT NULL,
  "outcome" TEXT NOT NULL DEFAULT 'PROCESSING',
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "XenditWebhookReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "XenditWebhookReceipt_idempotencyKey_key"
  ON "XenditWebhookReceipt"("idempotencyKey");
CREATE INDEX "XenditWebhookReceipt_paymentRequestId_idx"
  ON "XenditWebhookReceipt"("paymentRequestId");
CREATE INDEX "XenditWebhookReceipt_paymentId_idx"
  ON "XenditWebhookReceipt"("paymentId");