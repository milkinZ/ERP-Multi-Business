import { apiRequest } from "@/lib/api/client";

export type SupplierInvoiceStatus =
  | "DRAFT"
  | "HELD"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "POSTED"
  | "PARTIALLY_PAID"
  | "PAID"
  | "VOID";

export type AccountingAccountType =
  | "ASSET"
  | "LIABILITY"
  | "EQUITY"
  | "REVENUE"
  | "EXPENSE";

export type AccountingAccountRole =
  | "INVENTORY"
  | "GOODS_RECEIVED_NOT_INVOICED"
  | "ACCOUNTS_PAYABLE"
  | "SUPPLIER_RETURN_CLEARING"
  | "INPUT_TAX"
  | "WITHHOLDING_PAYABLE"
  | "PURCHASE_PRICE_VARIANCE"
  | "PURCHASE_DISCOUNT"
  | "COST_OF_GOODS_SOLD"
  | "NON_INVENTORY_EXPENSE"
  | "CASH_OR_BANK";

export type TaxRule = {
  id: string;
  code: string;
  name: string;
  kind: "INPUT_TAX" | "WITHHOLDING";
  transactionType: string;
  taxCategory: string | null;
  supplierTaxStatus: string | null;
  jurisdiction: string | null;
  rate: string | number;
  withholdingTiming: "INVOICE" | "PAYMENT" | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
};

export type SupplierInvoiceLine = {
  id: string;
  receiptItemId: string;
  quantity: string | number;
  unitPrice: string | number;
  matchedUnitPrice: string | number;
  subtotal: string | number;
  inputTaxAmount: string | number;
  withholdingAmount: string | number;
  ReceiptItem?: {
    id: string;
    Receipt?: {
      PurchaseOrder?: {
        id: string;
        poNumber: string;
      };
    };
  };
};

export type SupplierInvoice = {
  id: string;
  invoiceNumber: string;
  currencyCode: string;
  invoiceDate: string;
  dueDate: string | null;
  status: SupplierInvoiceStatus;
  matchStatus: "MATCHED" | "EXCEPTION";
  matchExceptions: unknown;
  subtotal: string | number;
  inputTaxAmount: string | number;
  withholdingAmount: string | number;
  grossAmount: string | number;
  netPayableAmount: string | number;
  withholdingTiming: "INVOICE" | "PAYMENT" | null;
  Supplier: { id: string; name: string };
  Lines: SupplierInvoiceLine[];
};

export type SupplierCreditNoteLine = {
  id: string;
  invoiceLineId: string | null;
  receiptItemId: string | null;
  returnItemId: string | null;
  allocationType:
    | "INVENTORY"
    | "COST_OF_GOODS_SOLD"
    | "PURCHASE_DISCOUNT"
    | "NON_INVENTORY";
  quantity: string | number | null;
  amount: string | number;
  inputTaxAdjustment: string | number;
  withholdingAdjustment: string | number;
};

export type SupplierCreditNote = {
  id: string;
  creditNumber: string;
  type: "RETURN" | "NON_RETURN";
  status: "PENDING_APPROVAL" | "APPROVED" | "POSTED" | "VOID";
  reason: string;
  claimReference: string | null;
  currencyCode: string;
  subtotal: string | number;
  withholdingAdjustment: string | number;
  grossAmount: string | number;
  Supplier: { id: string; name: string };
  Invoice: {
    id: string;
    invoiceNumber: string;
    status: SupplierInvoiceStatus;
  } | null;
  PurchaseOrderReturn: {
    id: string;
    purchaseOrderId: string;
    creditAmount: string | number;
  } | null;
  Lines: SupplierCreditNoteLine[];
};

export type SupplierPayment = {
  id: string;
  paymentDate: string;
  currencyCode: string;
  method: "CASH" | "BANK_TRANSFER" | "CHECK" | "OTHER";
  reference: string | null;
  amount: string | number;
  Supplier: { id: string; name: string };
  Allocations: Array<{
    id: string;
    allocatedAmount: string | number;
    withholdingAmount: string | number;
    netAmount: string | number;
    Invoice: {
      id: string;
      invoiceNumber: string;
      grossAmount: string | number;
      currencyCode: string;
    };
  }>;
};

export type AccountingAccount = {
  id: string;
  code: string;
  name: string;
  type: AccountingAccountType;
  isActive: boolean;
  Mappings: Array<{ role: AccountingAccountRole }>;
};

export type AccountingPeriod = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: "OPEN" | "CLOSED";
};

export type AccountingSettings = {
  invoiceApprovalRequired: boolean;
  autoPostMatchedInvoices: boolean;
};

export type JournalEntry = {
  id: string;
  number: string;
  sourceType: string;
  sourceId: string;
  currencyCode: string;
  entryDate: string;
  memo: string;
  status: "POSTED" | "REVERSED";
  Period: { id: string; name: string; status: "OPEN" | "CLOSED" };
  Lines: Array<{
    id: string;
    accountId: string;
    description: string | null;
    debit: string | number;
    credit: string | number;
    Account: { id: string; code: string; name: string };
  }>;
};

function listPath(path: string, skip = 0, take = 50) {
  return `${path}?${new URLSearchParams({ skip: String(skip), take: String(take) })}`;
}

function idempotencyHeaders() {
  return { "Idempotency-Key": crypto.randomUUID() };
}

export const financeKeys = {
  all: (tenantId: string) => ["finance", tenantId] as const,
  invoices: (tenantId: string) => ["finance", tenantId, "invoices"] as const,
  payments: (tenantId: string) => ["finance", tenantId, "payments"] as const,
  creditNotes: (tenantId: string) =>
    ["finance", tenantId, "credit-notes"] as const,
  journals: (tenantId: string) => ["finance", tenantId, "journals"] as const,
  settings: (tenantId: string) => ["finance", tenantId, "settings"] as const,
};

export function getSupplierInvoices() {
  return apiRequest<SupplierInvoice[]>(
    listPath("/finance/supplier-invoices", 0, 100),
  );
}

export function createSupplierInvoice(input: {
  supplierId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  lines: Array<{
    receiptItemId: string;
    quantity: number;
    unitPrice: number;
    inputTaxRuleIds: string[];
    withholdingRuleIds: string[];
    taxExemptReason?: string;
  }>;
}) {
  return apiRequest<SupplierInvoice>("/finance/supplier-invoices", {
    method: "POST",
    headers: idempotencyHeaders(),
    body: JSON.stringify(input),
  });
}

export function approveSupplierInvoice(id: string) {
  return apiRequest<SupplierInvoice>(
    `/finance/supplier-invoices/${encodeURIComponent(id)}/approve`,
    { method: "POST" },
  );
}

export function postSupplierInvoice(id: string) {
  return apiRequest<SupplierInvoice>(
    `/finance/supplier-invoices/${encodeURIComponent(id)}/post`,
    { method: "POST" },
  );
}

export function getSupplierPayments() {
  return apiRequest<SupplierPayment[]>(
    listPath("/finance/supplier-payments", 0, 100),
  );
}

export function createSupplierPayment(input: {
  supplierId: string;
  paymentDate: string;
  method: SupplierPayment["method"];
  reference?: string;
  allocations: Array<{ invoiceId: string; allocatedGross: number }>;
}) {
  return apiRequest<SupplierPayment>("/finance/supplier-payments", {
    method: "POST",
    headers: idempotencyHeaders(),
    body: JSON.stringify(input),
  });
}

export function getSupplierCreditNotes() {
  return apiRequest<SupplierCreditNote[]>(
    listPath("/finance/supplier-credit-notes", 0, 100),
  );
}

export function createSupplierCreditNote(input: {
  supplierId: string;
  invoiceId?: string;
  purchaseOrderReturnId?: string;
  creditNumber: string;
  type: SupplierCreditNote["type"];
  reason: string;
  claimReference?: string;
  lines: Array<{
    allocationType: SupplierCreditNoteLine["allocationType"];
    amount: number;
    quantity?: number;
    invoiceLineId?: string;
    receiptItemId?: string;
    returnItemId?: string;
    inputTaxRuleIds: string[];
    withholdingRuleIds: string[];
    taxExemptReason?: string;
  }>;
}) {
  return apiRequest<SupplierCreditNote>("/finance/supplier-credit-notes", {
    method: "POST",
    headers: idempotencyHeaders(),
    body: JSON.stringify(input),
  });
}

export function approveSupplierCreditNote(id: string) {
  return apiRequest<SupplierCreditNote>(
    `/finance/supplier-credit-notes/${encodeURIComponent(id)}/approve`,
    { method: "POST" },
  );
}

export function postSupplierCreditNote(id: string) {
  return apiRequest<SupplierCreditNote>(
    `/finance/supplier-credit-notes/${encodeURIComponent(id)}/post`,
    { method: "POST" },
  );
}

export function getAccountingAccounts() {
  return apiRequest<AccountingAccount[]>("/finance/accounts");
}

export function createAccountingAccount(input: {
  code: string;
  name: string;
  type: AccountingAccountType;
}) {
  return apiRequest<AccountingAccount>("/finance/accounts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function mapAccountingAccount(input: {
  role: AccountingAccountRole;
  accountId: string;
}) {
  return apiRequest("/finance/account-mappings", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getAccountingPeriods() {
  return apiRequest<AccountingPeriod[]>("/finance/periods");
}

export function createAccountingPeriod(input: {
  name: string;
  startsAt: string;
  endsAt: string;
}) {
  return apiRequest<AccountingPeriod>("/finance/periods", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function closeAccountingPeriod(id: string) {
  return apiRequest<AccountingPeriod>(
    `/finance/periods/${encodeURIComponent(id)}/close`,
    { method: "POST" },
  );
}

export function getAccountingSettings() {
  return apiRequest<AccountingSettings>("/finance/settings");
}

export function updateAccountingSettings(input: AccountingSettings) {
  return apiRequest<AccountingSettings>("/finance/settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function getTaxRules() {
  return apiRequest<TaxRule[]>("/finance/tax-rules");
}

export function createTaxRule(input: {
  code: string;
  name: string;
  kind: TaxRule["kind"];
  transactionType: string;
  taxCategory?: string;
  supplierTaxStatus?: string;
  jurisdiction?: string;
  rate: number;
  withholdingTiming?: NonNullable<TaxRule["withholdingTiming"]>;
  effectiveFrom: string;
  effectiveTo?: string;
}) {
  return apiRequest<TaxRule>("/finance/tax-rules", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getJournalEntries() {
  return apiRequest<JournalEntry[]>(listPath("/finance/journals", 0, 100));
}
