ALTER TABLE "Invoice"
ADD COLUMN "refundedAmountCents" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "InvoiceRefund" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "providerRefundId" TEXT,
  "amountCents" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "providerStatus" TEXT,
  "actorType" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "InvoiceRefund_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvoiceRefund_referenceId_key"
ON "InvoiceRefund"("referenceId");

CREATE UNIQUE INDEX "InvoiceRefund_providerRefundId_key"
ON "InvoiceRefund"("providerRefundId");

CREATE INDEX "InvoiceRefund_tenantId_invoiceId_createdAt_idx"
ON "InvoiceRefund"("tenantId", "invoiceId", "createdAt");

CREATE INDEX "InvoiceRefund_tenantId_status_idx"
ON "InvoiceRefund"("tenantId", "status");

ALTER TABLE "InvoiceRefund"
ADD CONSTRAINT "InvoiceRefund_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InvoiceRefund"
ADD CONSTRAINT "InvoiceRefund_invoiceId_fkey"
FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
