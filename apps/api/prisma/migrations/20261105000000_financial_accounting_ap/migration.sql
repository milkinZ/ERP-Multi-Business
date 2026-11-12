CREATE TYPE "AccountingAccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
CREATE TYPE "AccountingAccountRole" AS ENUM ('INVENTORY', 'GOODS_RECEIVED_NOT_INVOICED', 'ACCOUNTS_PAYABLE', 'SUPPLIER_RETURN_CLEARING', 'INPUT_TAX', 'WITHHOLDING_PAYABLE', 'PURCHASE_PRICE_VARIANCE', 'PURCHASE_DISCOUNT', 'COST_OF_GOODS_SOLD', 'NON_INVENTORY_EXPENSE', 'CASH_OR_BANK');
CREATE TYPE "AccountingPeriodStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "JournalEntryStatus" AS ENUM ('POSTED', 'REVERSED');
CREATE TYPE "TaxRuleKind" AS ENUM ('INPUT_TAX', 'WITHHOLDING');
CREATE TYPE "WithholdingTiming" AS ENUM ('INVOICE', 'PAYMENT');
CREATE TYPE "SupplierInvoiceStatus" AS ENUM ('DRAFT', 'HELD', 'PENDING_APPROVAL', 'APPROVED', 'POSTED', 'PARTIALLY_PAID', 'PAID', 'VOID');
CREATE TYPE "SupplierInvoiceMatchStatus" AS ENUM ('MATCHED', 'EXCEPTION');
CREATE TYPE "SupplierCreditNoteType" AS ENUM ('RETURN', 'NON_RETURN');
CREATE TYPE "SupplierCreditNoteStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'POSTED', 'VOID');
CREATE TYPE "CreditAllocationType" AS ENUM ('INVENTORY', 'COST_OF_GOODS_SOLD', 'PURCHASE_DISCOUNT', 'NON_INVENTORY');
CREATE TYPE "SupplierPaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHECK', 'OTHER');

ALTER TABLE "InventoryItem" ADD COLUMN "TaxCategory" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "taxStatus" VARCHAR(64);
ALTER TABLE "Tenant" ADD COLUMN "taxJurisdiction" VARCHAR(64);
ALTER TABLE "PurchaseOrderReceiptItem" ADD COLUMN "movementId" TEXT;
CREATE UNIQUE INDEX "PurchaseOrderReceiptItem_movementId_key" ON "PurchaseOrderReceiptItem"("movementId");
ALTER TABLE "PurchaseOrderReceiptItem" ADD CONSTRAINT "PurchaseOrderReceiptItem_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "InventoryMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderReturnItem"
    ADD COLUMN "invoicedQuantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    ADD COLUMN "invoicedCreditAmount" DECIMAL(18,6) NOT NULL DEFAULT 0;

CREATE TABLE "AccountingSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceApprovalRequired" BOOLEAN NOT NULL DEFAULT true,
    "autoPostMatchedInvoices" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccountingSettings_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AccountingAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" "AccountingAccountType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccountingAccount_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AccountingAccountMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "AccountingAccountRole" NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccountingAccountMapping_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AccountingPeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "startsAt" DATE NOT NULL,
    "endsAt" DATE NOT NULL,
    "status" "AccountingPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "sourceType" VARCHAR(48) NOT NULL,
    "sourceId" VARCHAR(191) NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "entryDate" DATE NOT NULL,
    "memo" VARCHAR(500) NOT NULL,
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'POSTED',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "JournalEntryLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "description" VARCHAR(240),
    "debit" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JournalEntryLine_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TaxRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "kind" "TaxRuleKind" NOT NULL,
    "transactionType" VARCHAR(48) NOT NULL,
    "taxCategory" VARCHAR(64),
    "supplierTaxStatus" VARCHAR(64),
    "jurisdiction" VARCHAR(64),
    "rate" DECIMAL(12,8) NOT NULL,
    "withholdingTiming" "WithholdingTiming",
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TaxRule_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SupplierInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "invoiceNumber" VARCHAR(80) NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "dueDate" DATE,
    "status" "SupplierInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "matchStatus" "SupplierInvoiceMatchStatus" NOT NULL DEFAULT 'MATCHED',
    "subtotal" DECIMAL(18,6) NOT NULL,
    "inputTaxAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "withholdingAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "grossAmount" DECIMAL(18,6) NOT NULL,
    "netPayableAmount" DECIMAL(18,6) NOT NULL,
    "withholdingTiming" "WithholdingTiming",
    "taxSnapshot" JSONB,
    "withholdingSnapshot" JSONB,
    "matchExceptions" JSONB,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplierInvoice_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SupplierInvoiceLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "receiptItemId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitPrice" DECIMAL(18,6) NOT NULL,
    "matchedUnitPrice" DECIMAL(18,6) NOT NULL,
    "subtotal" DECIMAL(18,6) NOT NULL,
    "inputTaxAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "withholdingAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "taxCategory" VARCHAR(64),
    "taxSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierInvoiceLine_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SupplierCreditNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "purchaseOrderReturnId" TEXT,
    "creditNumber" VARCHAR(80) NOT NULL,
    "type" "SupplierCreditNoteType" NOT NULL,
    "status" "SupplierCreditNoteStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "reason" VARCHAR(500) NOT NULL,
    "claimReference" VARCHAR(120),
    "currencyCode" CHAR(3) NOT NULL,
    "subtotal" DECIMAL(18,6) NOT NULL,
    "inputTaxAdjustment" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "withholdingAdjustment" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "grossAmount" DECIMAL(18,6) NOT NULL,
    "taxSnapshot" JSONB,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplierCreditNote_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SupplierCreditNoteLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "creditNoteId" TEXT NOT NULL,
    "invoiceLineId" TEXT,
    "receiptItemId" TEXT,
    "returnItemId" TEXT,
    "allocationType" "CreditAllocationType" NOT NULL,
    "quantity" DECIMAL(18,6),
    "amount" DECIMAL(18,6) NOT NULL,
    "inputTaxAdjustment" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "withholdingAdjustment" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "reason" VARCHAR(240),
    "taxSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierCreditNoteLine_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SupplierPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "paymentDate" DATE NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "method" "SupplierPaymentMethod" NOT NULL,
    "reference" VARCHAR(120),
    "amount" DECIMAL(18,6) NOT NULL,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SupplierPaymentAllocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "allocatedAmount" DECIMAL(18,6) NOT NULL,
    "withholdingAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(18,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierPaymentAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountingSettings_tenantId_key" ON "AccountingSettings"("tenantId");
CREATE UNIQUE INDEX "AccountingAccount_tenantId_code_key" ON "AccountingAccount"("tenantId", "code");
CREATE INDEX "AccountingAccount_tenantId_isActive_code_idx" ON "AccountingAccount"("tenantId", "isActive", "code");
CREATE UNIQUE INDEX "AccountingAccountMapping_tenantId_role_key" ON "AccountingAccountMapping"("tenantId", "role");
CREATE INDEX "AccountingAccountMapping_tenantId_accountId_idx" ON "AccountingAccountMapping"("tenantId", "accountId");
CREATE UNIQUE INDEX "AccountingPeriod_tenantId_name_key" ON "AccountingPeriod"("tenantId", "name");
CREATE INDEX "AccountingPeriod_tenantId_status_startsAt_endsAt_idx" ON "AccountingPeriod"("tenantId", "status", "startsAt", "endsAt");
CREATE UNIQUE INDEX "JournalEntry_tenantId_number_key" ON "JournalEntry"("tenantId", "number");
CREATE UNIQUE INDEX "JournalEntry_tenantId_sourceType_sourceId_key" ON "JournalEntry"("tenantId", "sourceType", "sourceId");
CREATE INDEX "JournalEntry_tenantId_entryDate_id_idx" ON "JournalEntry"("tenantId", "entryDate", "id");
CREATE INDEX "JournalEntry_tenantId_periodId_status_idx" ON "JournalEntry"("tenantId", "periodId", "status");
CREATE INDEX "JournalEntryLine_tenantId_journalEntryId_idx" ON "JournalEntryLine"("tenantId", "journalEntryId");
CREATE INDEX "JournalEntryLine_tenantId_accountId_idx" ON "JournalEntryLine"("tenantId", "accountId");
CREATE UNIQUE INDEX "TaxRule_tenantId_code_key" ON "TaxRule"("tenantId", "code");
CREATE INDEX "TaxRule_tenantId_kind_transactionType_effectiveFrom_effectiveTo_idx" ON "TaxRule"("tenantId", "kind", "transactionType", "effectiveFrom", "effectiveTo");
CREATE UNIQUE INDEX "SupplierInvoice_tenantId_supplierId_invoiceNumber_key" ON "SupplierInvoice"("tenantId", "supplierId", "invoiceNumber");
CREATE UNIQUE INDEX "SupplierInvoice_tenantId_idempotencyKey_key" ON "SupplierInvoice"("tenantId", "idempotencyKey");
CREATE INDEX "SupplierInvoice_tenantId_status_invoiceDate_id_idx" ON "SupplierInvoice"("tenantId", "status", "invoiceDate", "id");
CREATE INDEX "SupplierInvoice_tenantId_supplierId_status_idx" ON "SupplierInvoice"("tenantId", "supplierId", "status");
CREATE UNIQUE INDEX "SupplierInvoiceLine_invoiceId_receiptItemId_key" ON "SupplierInvoiceLine"("invoiceId", "receiptItemId");
CREATE INDEX "SupplierInvoiceLine_tenantId_receiptItemId_idx" ON "SupplierInvoiceLine"("tenantId", "receiptItemId");
CREATE UNIQUE INDEX "SupplierCreditNote_tenantId_supplierId_creditNumber_key" ON "SupplierCreditNote"("tenantId", "supplierId", "creditNumber");
CREATE UNIQUE INDEX "SupplierCreditNote_tenantId_idempotencyKey_key" ON "SupplierCreditNote"("tenantId", "idempotencyKey");
CREATE INDEX "SupplierCreditNote_tenantId_status_createdAt_id_idx" ON "SupplierCreditNote"("tenantId", "status", "createdAt", "id");
CREATE INDEX "SupplierCreditNote_tenantId_purchaseOrderReturnId_idx" ON "SupplierCreditNote"("tenantId", "purchaseOrderReturnId");
CREATE INDEX "SupplierCreditNote_tenantId_invoiceId_idx" ON "SupplierCreditNote"("tenantId", "invoiceId");
CREATE INDEX "SupplierCreditNoteLine_tenantId_creditNoteId_idx" ON "SupplierCreditNoteLine"("tenantId", "creditNoteId");
CREATE INDEX "SupplierCreditNoteLine_tenantId_receiptItemId_idx" ON "SupplierCreditNoteLine"("tenantId", "receiptItemId");
CREATE UNIQUE INDEX "SupplierPayment_tenantId_idempotencyKey_key" ON "SupplierPayment"("tenantId", "idempotencyKey");
CREATE INDEX "SupplierPayment_tenantId_supplierId_paymentDate_id_idx" ON "SupplierPayment"("tenantId", "supplierId", "paymentDate", "id");
CREATE UNIQUE INDEX "SupplierPaymentAllocation_paymentId_invoiceId_key" ON "SupplierPaymentAllocation"("paymentId", "invoiceId");
CREATE INDEX "SupplierPaymentAllocation_tenantId_invoiceId_idx" ON "SupplierPaymentAllocation"("tenantId", "invoiceId");

ALTER TABLE "AccountingSettings" ADD CONSTRAINT "AccountingSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingAccount" ADD CONSTRAINT "AccountingAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingAccountMapping" ADD CONSTRAINT "AccountingAccountMapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingAccountMapping" ADD CONSTRAINT "AccountingAccountMapping_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AccountingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AccountingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoiceLine" ADD CONSTRAINT "SupplierInvoiceLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoiceLine" ADD CONSTRAINT "SupplierInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoiceLine" ADD CONSTRAINT "SupplierInvoiceLine_receiptItemId_fkey" FOREIGN KEY ("receiptItemId") REFERENCES "PurchaseOrderReceiptItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierCreditNote" ADD CONSTRAINT "SupplierCreditNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierCreditNote" ADD CONSTRAINT "SupplierCreditNote_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierCreditNote" ADD CONSTRAINT "SupplierCreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierCreditNote" ADD CONSTRAINT "SupplierCreditNote_purchaseOrderReturnId_fkey" FOREIGN KEY ("purchaseOrderReturnId") REFERENCES "PurchaseOrderReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierCreditNoteLine" ADD CONSTRAINT "SupplierCreditNoteLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierCreditNoteLine" ADD CONSTRAINT "SupplierCreditNoteLine_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "SupplierCreditNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierCreditNoteLine" ADD CONSTRAINT "SupplierCreditNoteLine_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "SupplierInvoiceLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierCreditNoteLine" ADD CONSTRAINT "SupplierCreditNoteLine_receiptItemId_fkey" FOREIGN KEY ("receiptItemId") REFERENCES "PurchaseOrderReceiptItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierCreditNoteLine" ADD CONSTRAINT "SupplierCreditNoteLine_returnItemId_fkey" FOREIGN KEY ("returnItemId") REFERENCES "PurchaseOrderReturnItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierPaymentAllocation" ADD CONSTRAINT "SupplierPaymentAllocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierPaymentAllocation" ADD CONSTRAINT "SupplierPaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "SupplierPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierPaymentAllocation" ADD CONSTRAINT "SupplierPaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
