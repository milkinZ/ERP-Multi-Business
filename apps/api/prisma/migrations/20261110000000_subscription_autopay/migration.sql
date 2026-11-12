CREATE TABLE "AutopayPaymentMethod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "providerPaymentRequestId" TEXT,
    "providerPaymentTokenIdCiphertext" TEXT,
    "encryptionIv" TEXT,
    "encryptionAuthTag" TEXT,
    "encryptionKeyVersion" TEXT,
    "tokenFingerprint" TEXT,
    "channelCode" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "consentAt" TIMESTAMP(3) NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "consentUserId" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AutopayPaymentMethod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutopayChargeAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "referenceId" TEXT NOT NULL,
    "providerPaymentRequestId" TEXT,
    "providerPaymentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "nextAttemptAt" TIMESTAMP(3),
    "errorCategory" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "AutopayChargeAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutopayPaymentMethod_referenceId_key"
ON "AutopayPaymentMethod"("referenceId");

CREATE UNIQUE INDEX "AutopayPaymentMethod_providerPaymentRequestId_key"
ON "AutopayPaymentMethod"("providerPaymentRequestId");

CREATE INDEX "AutopayPaymentMethod_tenantId_status_createdAt_idx"
ON "AutopayPaymentMethod"("tenantId", "status", "createdAt");

CREATE UNIQUE INDEX "AutopayChargeAttempt_referenceId_key"
ON "AutopayChargeAttempt"("referenceId");

CREATE UNIQUE INDEX "AutopayChargeAttempt_providerPaymentRequestId_key"
ON "AutopayChargeAttempt"("providerPaymentRequestId");

CREATE UNIQUE INDEX "AutopayChargeAttempt_providerPaymentId_key"
ON "AutopayChargeAttempt"("providerPaymentId");

CREATE UNIQUE INDEX "AutopayChargeAttempt_invoiceId_attemptNumber_key"
ON "AutopayChargeAttempt"("invoiceId", "attemptNumber");

CREATE INDEX "AutopayChargeAttempt_tenantId_status_nextAttemptAt_idx"
ON "AutopayChargeAttempt"("tenantId", "status", "nextAttemptAt");

CREATE INDEX "AutopayChargeAttempt_invoiceId_status_idx"
ON "AutopayChargeAttempt"("invoiceId", "status");

ALTER TABLE "AutopayPaymentMethod"
ADD CONSTRAINT "AutopayPaymentMethod_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AutopayChargeAttempt"
ADD CONSTRAINT "AutopayChargeAttempt_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AutopayChargeAttempt"
ADD CONSTRAINT "AutopayChargeAttempt_invoiceId_fkey"
FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
