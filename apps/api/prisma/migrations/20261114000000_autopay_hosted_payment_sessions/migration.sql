ALTER TABLE "AutopayPaymentMethod"
ADD COLUMN "invoiceId" TEXT,
ADD COLUMN "providerPaymentSessionId" TEXT;

CREATE UNIQUE INDEX "AutopayPaymentMethod_providerPaymentSessionId_key"
ON "AutopayPaymentMethod"("providerPaymentSessionId");

CREATE INDEX "AutopayPaymentMethod_invoiceId_idx"
ON "AutopayPaymentMethod"("invoiceId");

ALTER TABLE "AutopayPaymentMethod"
ADD CONSTRAINT "AutopayPaymentMethod_invoiceId_fkey"
FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
