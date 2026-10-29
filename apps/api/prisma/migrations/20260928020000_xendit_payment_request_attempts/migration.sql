CREATE TYPE "XenditPaymentRequestAttemptState" AS ENUM (
  'IN_PROGRESS',
  'REJECTED',
  'UNKNOWN',
  'COMPLETED'
);

CREATE TABLE "XenditPaymentRequestAttempt" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "state" "XenditPaymentRequestAttemptState" NOT NULL DEFAULT 'IN_PROGRESS',
  "providerPaymentRequestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "XenditPaymentRequestAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "XenditPaymentRequestAttempt_invoiceId_key"
  ON "XenditPaymentRequestAttempt"("invoiceId");
CREATE UNIQUE INDEX "XenditPaymentRequestAttempt_providerPaymentRequestId_key"
  ON "XenditPaymentRequestAttempt"("providerPaymentRequestId");
CREATE INDEX "XenditPaymentRequestAttempt_tenantId_state_idx"
  ON "XenditPaymentRequestAttempt"("tenantId", "state");

ALTER TABLE "XenditPaymentRequestAttempt"
  ADD CONSTRAINT "XenditPaymentRequestAttempt_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;