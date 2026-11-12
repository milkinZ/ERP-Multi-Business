"use client";

import React, {
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  SectionHeader,
  StatusBadge,
  UnavailableState,
} from "@/components/data-display/states";
import {
  type AccountingAccountRole,
  type AccountingAccountType,
  type SupplierCreditNote,
  type SupplierInvoice,
  type SupplierInvoiceStatus,
  approveSupplierCreditNote,
  approveSupplierInvoice,
  closeAccountingPeriod,
  createAccountingAccount,
  createAccountingPeriod,
  createSupplierCreditNote,
  createSupplierInvoice,
  createSupplierPayment,
  createTaxRule,
  financeKeys,
  getAccountingAccounts,
  getAccountingPeriods,
  getAccountingSettings,
  getJournalEntries,
  getSupplierCreditNotes,
  getSupplierInvoices,
  getSupplierPayments,
  getTaxRules,
  mapAccountingAccount,
  postSupplierCreditNote,
  postSupplierInvoice,
  updateAccountingSettings,
} from "@/features/erp/finance/api/queries";
import {
  getPurchaseOrderReceipts,
  getPurchaseOrderReturns,
  getPurchaseOrders,
  type PurchaseOrder,
  type PurchaseOrderReturn,
} from "@/features/erp/purchase-orders/api/queries";
import { getSuppliers } from "@/features/erp/suppliers/api/queries";
import { ApiError } from "@/lib/api/client";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";

const ACCOUNT_ROLES: AccountingAccountRole[] = [
  "INVENTORY",
  "GOODS_RECEIVED_NOT_INVOICED",
  "ACCOUNTS_PAYABLE",
  "SUPPLIER_RETURN_CLEARING",
  "INPUT_TAX",
  "WITHHOLDING_PAYABLE",
  "PURCHASE_PRICE_VARIANCE",
  "PURCHASE_DISCOUNT",
  "COST_OF_GOODS_SOLD",
  "NON_INVENTORY_EXPENSE",
  "CASH_OR_BANK",
];

const ACCOUNT_TYPES: AccountingAccountType[] = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "EXPENSE",
];

const INVOICE_STATUSES: SupplierInvoiceStatus[] = ["POSTED", "PARTIALLY_PAID"];

type Tab = "ap" | "credit-notes" | "journals" | "setup";
type DraftInvoiceLine = {
  receiptItemId: string;
  quantity: string;
  unitPrice: string;
};
type DraftPaymentAllocation = { invoiceId: string; allocatedGross: string };
type ReturnLineOption = {
  returnId: string;
  item: PurchaseOrderReturn["Items"][number];
};

function messageFor(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "The request could not be completed.";
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-foreground">
      <span>{label}</span>
      {children}
      {hint ? (
        <span className="block text-xs font-normal text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";
const buttonClass =
  "rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass =
  "rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";

function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      {messageFor(error)}
    </p>
  );
}

function money(value: number | string, currency: string) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(amount)
    : `${value} ${currency}`;
}

function dateValue(value: string) {
  return value.slice(0, 10);
}

function todayDate() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function FinanceWorkspace() {
  const queryClient = useQueryClient();
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const tenantId = session?.tenantId;
  const canRead = hasPermission(session, "finance.read");
  const canManage = hasPermission(session, "finance.manage");
  const canApprove = hasPermission(session, "finance.approve");
  const canPost = hasPermission(session, "finance.post");
  const [tab, setTab] = useState<Tab>("ap");
  const [notice, setNotice] = useState<string | null>(null);

  const invoicesQuery = useQuery({
    queryKey: tenantId
      ? financeKeys.invoices(tenantId)
      : ["finance", "skip", "invoices"],
    queryFn: getSupplierInvoices,
    enabled: Boolean(token && tenantId && canRead),
    staleTime: 30_000,
  });
  const paymentsQuery = useQuery({
    queryKey: tenantId
      ? financeKeys.payments(tenantId)
      : ["finance", "skip", "payments"],
    queryFn: getSupplierPayments,
    enabled: Boolean(token && tenantId && canRead),
    staleTime: 30_000,
  });
  const creditNotesQuery = useQuery({
    queryKey: tenantId
      ? financeKeys.creditNotes(tenantId)
      : ["finance", "skip", "credit-notes"],
    queryFn: getSupplierCreditNotes,
    enabled: Boolean(token && tenantId && canRead),
    staleTime: 30_000,
  });
  const journalsQuery = useQuery({
    queryKey: tenantId
      ? financeKeys.journals(tenantId)
      : ["finance", "skip", "journals"],
    queryFn: getJournalEntries,
    enabled: Boolean(token && tenantId && canRead && tab === "journals"),
    staleTime: 30_000,
  });
  const accountsQuery = useQuery({
    queryKey: tenantId
      ? [...financeKeys.all(tenantId), "accounts"]
      : ["finance", "skip", "accounts"],
    queryFn: getAccountingAccounts,
    enabled: Boolean(token && tenantId && canRead && tab === "setup"),
    staleTime: 60_000,
  });
  const periodsQuery = useQuery({
    queryKey: tenantId
      ? [...financeKeys.all(tenantId), "periods"]
      : ["finance", "skip", "periods"],
    queryFn: getAccountingPeriods,
    enabled: Boolean(token && tenantId && canRead && tab === "setup"),
    staleTime: 60_000,
  });
  const settingsQuery = useQuery({
    queryKey: tenantId
      ? financeKeys.settings(tenantId)
      : ["finance", "skip", "settings"],
    queryFn: getAccountingSettings,
    enabled: Boolean(token && tenantId && canRead && tab === "setup"),
    staleTime: 60_000,
  });
  const taxRulesQuery = useQuery({
    queryKey: tenantId
      ? [...financeKeys.all(tenantId), "tax-rules"]
      : ["finance", "skip", "tax-rules"],
    queryFn: getTaxRules,
    enabled: Boolean(token && tenantId && canRead),
    staleTime: 60_000,
  });
  const suppliersQuery = useQuery({
    queryKey: tenantId
      ? ["suppliers", tenantId, "finance-options"]
      : ["suppliers", "skip", "finance-options"],
    queryFn: () => getSuppliers(token as string),
    enabled: Boolean(token && tenantId && canManage),
    staleTime: 60_000,
  });
  const purchaseOrdersQuery = useQuery({
    queryKey: tenantId
      ? ["purchase-orders", tenantId, "finance-options"]
      : ["purchase-orders", "skip", "finance-options"],
    queryFn: () =>
      getPurchaseOrders(token as string, {
        skip: 0,
        take: 100,
        sortBy: "createdAt",
        sortOrder: "desc",
      }),
    enabled: Boolean(token && tenantId && canManage),
    staleTime: 30_000,
  });

  const invalidateFinance = async () => {
    if (tenantId) {
      await queryClient.invalidateQueries({
        queryKey: financeKeys.all(tenantId),
      });
    }
    setNotice("Finance records were updated.");
  };

  const approveInvoiceMutation = useMutation({
    mutationFn: approveSupplierInvoice,
    retry: 0,
    onSuccess: invalidateFinance,
  });
  const postInvoiceMutation = useMutation({
    mutationFn: postSupplierInvoice,
    retry: 0,
    onSuccess: invalidateFinance,
  });
  const approveCreditMutation = useMutation({
    mutationFn: approveSupplierCreditNote,
    retry: 0,
    onSuccess: invalidateFinance,
  });
  const postCreditMutation = useMutation({
    mutationFn: postSupplierCreditNote,
    retry: 0,
    onSuccess: invalidateFinance,
  });

  const invoices = invoicesQuery.data ?? [];
  const suppliers = suppliersQuery.data ?? [];
  const purchaseOrders = (purchaseOrdersQuery.data?.data ?? []).filter(
    (order) =>
      order.status === "PARTIALLY_RECEIVED" ||
      order.status === "RECEIVED" ||
      order.status === "COMPLETED",
  );
  const taxRules = (taxRulesQuery.data ?? []).filter((rule) => rule.isActive);
  const invoiceLoadError = [
    invoicesQuery.error,
    paymentsQuery.error,
    creditNotesQuery.error,
    taxRulesQuery.error,
  ].find(Boolean);

  if (!canRead) {
    return (
      <UnavailableState
        title="Finance access is restricted"
        description="Your current tenant session does not include the finance.read permission."
      />
    );
  }
  if (invoicesQuery.isPending || paymentsQuery.isPending) {
    return (
      <div className="space-y-3">
        <div className="h-20 animate-pulse rounded-3xl bg-muted" />
        <div className="h-64 animate-pulse rounded-3xl bg-muted" />
      </div>
    );
  }
  if (invoiceLoadError) {
    return (
      <UnavailableState
        title="Unable to load finance records"
        description={messageFor(invoiceLoadError)}
      />
    );
  }

  const tabButton = (key: Tab, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => {
        setTab(key);
        setNotice(null);
      }}
      aria-pressed={tab === key}
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
        tab === key
          ? "bg-primary text-white"
          : "border border-border text-muted-foreground hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Finance" title="Supplier finance" />
      <p className="-mt-4 text-sm text-muted-foreground">
        Manage supplier invoices, credit notes, accounts payable, tax rules, and
        posted journals.
      </p>
      {notice ? (
        <p
          role="status"
          className="rounded-xl border border-[var(--success)]/30 bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]"
        >
          {notice}
        </p>
      ) : null}
      <nav className="flex flex-wrap gap-2" aria-label="Finance sections">
        {tabButton("ap", "Invoices & payments")}
        {tabButton("credit-notes", "Credit notes")}
        {tabButton("journals", "Journal entries")}
        {canManage ? tabButton("setup", "Accounting setup") : null}
      </nav>

      {tab === "ap" ? (
        <AccountsPayablePanel
          invoices={invoices}
          payments={paymentsQuery.data ?? []}
          creditNotes={creditNotesQuery.data ?? []}
          suppliers={suppliers}
          purchaseOrders={purchaseOrders}
          taxRules={taxRules}
          canManage={canManage}
          canApprove={canApprove}
          canPost={canPost}
          loadingOptions={
            suppliersQuery.isPending || purchaseOrdersQuery.isPending
          }
          optionsError={suppliersQuery.error ?? purchaseOrdersQuery.error}
          onCreateInvoice={async (input) => {
            await createSupplierInvoice(input);
            await invalidateFinance();
          }}
          onCreatePayment={async (input) => {
            await createSupplierPayment(input);
            await invalidateFinance();
          }}
          onApproveInvoice={(id) => approveInvoiceMutation.mutate(id)}
          onPostInvoice={(id) => postInvoiceMutation.mutate(id)}
          invoiceActionError={
            approveInvoiceMutation.error ?? postInvoiceMutation.error
          }
        />
      ) : null}
      {tab === "credit-notes" ? (
        <CreditNotesPanel
          invoices={invoices}
          notes={creditNotesQuery.data ?? []}
          taxRules={taxRules}
          canManage={canManage}
          canApprove={canApprove}
          canPost={canPost}
          loadingOptions={purchaseOrdersQuery.isPending}
          onCreate={async (input) => {
            await createSupplierCreditNote(input);
            await invalidateFinance();
          }}
          onApprove={(id) => approveCreditMutation.mutate(id)}
          onPost={(id) => postCreditMutation.mutate(id)}
          actionError={approveCreditMutation.error ?? postCreditMutation.error}
        />
      ) : null}
      {tab === "journals" ? (
        <JournalPanel
          entries={journalsQuery.data ?? []}
          isLoading={journalsQuery.isPending}
          error={journalsQuery.error}
        />
      ) : null}
      {tab === "setup" && canManage ? (
        <AccountingSetupPanel
          accounts={accountsQuery.data ?? []}
          periods={periodsQuery.data ?? []}
          settings={settingsQuery.data}
          taxRules={taxRulesQuery.data ?? []}
          isLoading={
            accountsQuery.isPending ||
            periodsQuery.isPending ||
            settingsQuery.isPending
          }
          error={
            accountsQuery.error ??
            periodsQuery.error ??
            settingsQuery.error ??
            taxRulesQuery.error
          }
          onRefresh={invalidateFinance}
        />
      ) : null}
    </div>
  );
}

function AccountsPayablePanel({
  invoices,
  payments,
  creditNotes,
  suppliers,
  purchaseOrders,
  taxRules,
  canManage,
  canApprove,
  canPost,
  loadingOptions,
  optionsError,
  onCreateInvoice,
  onCreatePayment,
  onApproveInvoice,
  onPostInvoice,
  invoiceActionError,
}: {
  invoices: SupplierInvoice[];
  payments: NonNullable<
    ReturnType<typeof getSupplierPayments> extends Promise<infer T> ? T : never
  >;
  creditNotes: SupplierCreditNote[];
  suppliers: Awaited<ReturnType<typeof getSuppliers>>;
  purchaseOrders: PurchaseOrder[];
  taxRules: Awaited<ReturnType<typeof getTaxRules>>;
  canManage: boolean;
  canApprove: boolean;
  canPost: boolean;
  loadingOptions: boolean;
  optionsError: unknown;
  onCreateInvoice: Parameters<typeof createSupplierInvoice>[0] extends infer T
    ? (input: T) => Promise<void>
    : never;
  onCreatePayment: Parameters<typeof createSupplierPayment>[0] extends infer T
    ? (input: T) => Promise<void>
    : never;
  onApproveInvoice: (id: string) => void;
  onPostInvoice: (id: string) => void;
  invoiceActionError: unknown;
}) {
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [selectedPurchaseOrderId, setSelectedPurchaseOrderId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayDate);
  const [dueDate, setDueDate] = useState("");
  const [invoiceLines, setInvoiceLines] = useState<DraftInvoiceLine[]>([
    { receiptItemId: "", quantity: "", unitPrice: "" },
  ]);
  const [invoiceInputTaxIds, setInvoiceInputTaxIds] = useState<string[]>([]);
  const [invoiceWithholdingIds, setInvoiceWithholdingIds] = useState<string[]>(
    [],
  );
  const [invoiceTaxReason, setInvoiceTaxReason] = useState("");
  const [paymentSupplierId, setPaymentSupplierId] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayDate);
  const [paymentMethod, setPaymentMethod] = useState<
    "CASH" | "BANK_TRANSFER" | "CHECK" | "OTHER"
  >("BANK_TRANSFER");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentAllocations, setPaymentAllocations] = useState<
    DraftPaymentAllocation[]
  >([{ invoiceId: "", allocatedGross: "" }]);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedPurchaseOrder = purchaseOrders.find(
    (order) => order.id === selectedPurchaseOrderId,
  );
  const receiptQuery = useQuery({
    queryKey: ["finance", "purchase-order-receipts", selectedPurchaseOrderId],
    queryFn: () =>
      getPurchaseOrderReceipts(
        useAuthStore.getState().accessToken as string,
        selectedPurchaseOrderId,
        0,
        100,
      ),
    enabled: Boolean(selectedPurchaseOrderId),
    staleTime: 30_000,
  });
  const returnQuery = useQuery({
    queryKey: ["finance", "purchase-order-returns", selectedPurchaseOrderId],
    queryFn: () =>
      getPurchaseOrderReturns(
        useAuthStore.getState().accessToken as string,
        selectedPurchaseOrderId,
        0,
        100,
      ),
    enabled: Boolean(selectedPurchaseOrderId),
    staleTime: 30_000,
  });
  const receipts = receiptQuery.data?.data ?? [];
  const returnedQuantities =
    returnQuery.data?.returnedQuantityByReceiptItem ?? {};
  const receiptOptions = receipts.flatMap((receipt) =>
    receipt.Items.map((item) => {
      const orderItem = selectedPurchaseOrder?.PurchaseOrderItem.find(
        (candidate) => candidate.id === item.purchaseOrderItemId,
      );
      const invoicedQuantity = invoices
        .filter((invoice) => invoice.status !== "VOID")
        .flatMap((invoice) => invoice.Lines)
        .filter((line) => line.receiptItemId === item.id)
        .reduce((total, line) => total + Number(line.quantity), 0);
      const availableQuantity =
        Number(item.receivedQuantity) -
        invoicedQuantity -
        Number(returnedQuantities[item.id] ?? 0);
      return {
        id: item.id,
        label: `${item.InventoryItem?.code ?? ""} ${item.InventoryItem?.name ?? item.id}`,
        availableQuantity,
        unitPrice: Number(orderItem?.unitPrice ?? 0),
        currencyCode: selectedPurchaseOrder?.currencyCode ?? "IDR",
      };
    }),
  );
  const activePurchaseRules = taxRules.filter(
    (rule) => rule.transactionType === "SUPPLIER_PURCHASE",
  );
  const eligibleInvoices = invoices.filter(
    (invoice) =>
      invoice.status === "POSTED" || invoice.status === "PARTIALLY_PAID",
  );
  const supplierPaymentInvoices = eligibleInvoices.filter(
    (invoice) => invoice.Supplier.id === paymentSupplierId,
  );
  const outstandingForInvoice = (invoice: SupplierInvoice) => {
    const payable =
      invoice.withholdingTiming === "INVOICE"
        ? Number(invoice.netPayableAmount)
        : Number(invoice.grossAmount);
    const allocated = payments
      .flatMap((payment) => payment.Allocations)
      .filter((allocation) => allocation.Invoice.id === invoice.id)
      .reduce(
        (total, allocation) => total + Number(allocation.allocatedAmount),
        0,
      );
    const credited = creditNotes
      .filter(
        (note) => note.status === "POSTED" && note.Invoice?.id === invoice.id,
      )
      .reduce(
        (total, note) =>
          total +
          Number(note.grossAmount) -
          (invoice.withholdingTiming === "INVOICE"
            ? Number(note.withholdingAdjustment)
            : 0),
        0,
      );
    return Math.max(0, payable - allocated - credited);
  };

  const createInvoiceMutation = useMutation({
    mutationFn: onCreateInvoice,
    retry: 0,
    onSuccess: () => {
      setShowInvoiceForm(false);
      setInvoiceNumber("");
      setSelectedPurchaseOrderId("");
      setInvoiceLines([{ receiptItemId: "", quantity: "", unitPrice: "" }]);
      setFormError(null);
    },
    onError: (error) => setFormError(messageFor(error)),
  });
  const createPaymentMutation = useMutation({
    mutationFn: onCreatePayment,
    retry: 0,
    onSuccess: () => {
      setShowPaymentForm(false);
      setPaymentAllocations([{ invoiceId: "", allocatedGross: "" }]);
      setFormError(null);
    },
    onError: (error) => setFormError(messageFor(error)),
  });

  const selectTaxRules = (
    rules: typeof taxRules,
    selected: string[],
    onChange: (values: string[]) => void,
  ) => (
    <select
      multiple
      value={selected}
      onChange={(event) =>
        onChange(
          Array.from(
            event.currentTarget.selectedOptions,
            (option) => option.value,
          ),
        )
      }
      className={`${inputClass} min-h-24`}
    >
      {rules.map((rule) => (
        <option key={rule.id} value={rule.id}>
          {rule.code} — {rule.name} ({Number(rule.rate) * 100}%)
        </option>
      ))}
    </select>
  );

  function submitInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!selectedPurchaseOrder?.Supplier?.id) {
      setFormError("Select an eligible Purchase Order.");
      return;
    }
    const lines = invoiceLines.filter((line) => line.receiptItemId);
    if (!lines.length) {
      setFormError("Add at least one received item to the invoice.");
      return;
    }
    createInvoiceMutation.mutate({
      supplierId: selectedPurchaseOrder.Supplier.id,
      invoiceNumber: invoiceNumber.trim(),
      invoiceDate,
      ...(dueDate ? { dueDate } : {}),
      lines: lines.map((line) => ({
        receiptItemId: line.receiptItemId,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        inputTaxRuleIds: invoiceInputTaxIds,
        withholdingRuleIds: invoiceWithholdingIds,
        ...(invoiceTaxReason.trim()
          ? { taxExemptReason: invoiceTaxReason.trim() }
          : {}),
      })),
    });
  }

  function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const allocations = paymentAllocations.filter(
      (allocation) =>
        allocation.invoiceId && Number(allocation.allocatedGross) > 0,
    );
    if (!paymentSupplierId || allocations.length === 0) {
      setFormError("Choose a supplier and at least one invoice allocation.");
      return;
    }
    createPaymentMutation.mutate({
      supplierId: paymentSupplierId,
      paymentDate,
      method: paymentMethod,
      ...(paymentReference.trim()
        ? { reference: paymentReference.trim() }
        : {}),
      allocations: allocations.map((allocation) => ({
        invoiceId: allocation.invoiceId,
        allocatedGross: Number(allocation.allocatedGross),
      })),
    });
  }

  return (
    <div className="space-y-6">
      <ErrorNotice error={optionsError} />
      <ErrorNotice error={invoiceActionError} />
      {formError ? <ErrorNotice error={formError} /> : null}
      <section className="space-y-4 rounded-3xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Supplier invoices
            </h2>
            <p className="text-sm text-muted-foreground">
              Invoices are matched against received quantities and PO prices
              before AP posting.
            </p>
          </div>
          {canManage ? (
            <button
              type="button"
              className={buttonClass}
              onClick={() => {
                setShowInvoiceForm((visible) => !visible);
                setFormError(null);
              }}
            >
              {showInvoiceForm ? "Close invoice form" : "Record invoice"}
            </button>
          ) : null}
        </div>

        {showInvoiceForm && canManage ? (
          <form
            onSubmit={submitInvoice}
            className="grid gap-4 rounded-2xl border border-border p-4 md:grid-cols-2"
          >
            <Field label="Purchase Order">
              <select
                required
                value={selectedPurchaseOrderId}
                onChange={(event) => {
                  setSelectedPurchaseOrderId(event.target.value);
                  setInvoiceLines([
                    { receiptItemId: "", quantity: "", unitPrice: "" },
                  ]);
                }}
                className={inputClass}
                disabled={loadingOptions}
              >
                <option value="">Select received Purchase Order</option>
                {purchaseOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.poNumber} ·{" "}
                    {order.Supplier?.name ?? order.supplierId}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Supplier invoice number">
              <input
                required
                maxLength={80}
                value={invoiceNumber}
                onChange={(event) => setInvoiceNumber(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Invoice date">
              <input
                required
                type="date"
                value={invoiceDate}
                onChange={(event) => setInvoiceDate(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Due date (optional)">
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className={inputClass}
              />
            </Field>

            {invoiceLines.map((line, index) => {
              const selectedOption = receiptOptions.find(
                (option) => option.id === line.receiptItemId,
              );
              return (
                <div
                  key={index}
                  className="grid gap-3 rounded-xl border border-border p-3 md:col-span-2 md:grid-cols-4"
                >
                  <Field label={`Received item ${index + 1}`}>
                    <select
                      required
                      value={line.receiptItemId}
                      onChange={(event) => {
                        const selected = receiptOptions.find(
                          (option) => option.id === event.target.value,
                        );
                        setInvoiceLines((current) =>
                          current.map((entry, rowIndex) =>
                            rowIndex === index
                              ? {
                                  ...entry,
                                  receiptItemId: event.target.value,
                                  quantity: selected
                                    ? String(selected.availableQuantity)
                                    : "",
                                  unitPrice: selected
                                    ? String(selected.unitPrice)
                                    : "",
                                }
                              : entry,
                          ),
                        );
                      }}
                      className={inputClass}
                      disabled={
                        !selectedPurchaseOrderId || receiptQuery.isPending
                      }
                    >
                      <option value="">Select receipt item</option>
                      {receiptOptions
                        .filter(
                          (option) =>
                            option.availableQuantity > 0 &&
                            (option.id === line.receiptItemId ||
                              !invoiceLines.some(
                                (other, rowIndex) =>
                                  rowIndex !== index &&
                                  other.receiptItemId === option.id,
                              )),
                        )
                        .map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label} · {option.availableQuantity}{" "}
                            available
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field
                    label="Quantity"
                    hint={`Available: ${selectedOption?.availableQuantity ?? "—"}`}
                  >
                    <input
                      required
                      type="number"
                      min="0.000001"
                      max={selectedOption?.availableQuantity}
                      step="0.000001"
                      value={line.quantity}
                      onChange={(event) =>
                        setInvoiceLines((current) =>
                          current.map((entry, rowIndex) =>
                            rowIndex === index
                              ? { ...entry, quantity: event.target.value }
                              : entry,
                          ),
                        )
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Unit price">
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.000001"
                      value={line.unitPrice}
                      onChange={(event) =>
                        setInvoiceLines((current) =>
                          current.map((entry, rowIndex) =>
                            rowIndex === index
                              ? { ...entry, unitPrice: event.target.value }
                              : entry,
                          ),
                        )
                      }
                      className={inputClass}
                    />
                  </Field>
                  <div className="flex items-end justify-between gap-2">
                    <p className="pb-2 text-xs text-muted-foreground">
                      {selectedOption
                        ? `PO price ${money(selectedOption.unitPrice, selectedOption.currencyCode)}`
                        : "Choose a received item"}
                    </p>
                    {invoiceLines.length > 1 ? (
                      <button
                        type="button"
                        className={secondaryButtonClass}
                        onClick={() =>
                          setInvoiceLines((current) =>
                            current.filter((_, rowIndex) => rowIndex !== index),
                          )
                        }
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
            <div className="flex flex-wrap gap-3 md:col-span-2">
              <button
                type="button"
                className={secondaryButtonClass}
                disabled={
                  !receiptOptions.some((option) => option.availableQuantity > 0)
                }
                onClick={() =>
                  setInvoiceLines((current) => [
                    ...current,
                    { receiptItemId: "", quantity: "", unitPrice: "" },
                  ])
                }
              >
                Add received item
              </button>
            </div>
            <Field
              label="Input-tax rules"
              hint="Leave unselected when this line is explicitly tax-exempt."
            >
              {selectTaxRules(
                activePurchaseRules.filter((rule) => rule.kind === "INPUT_TAX"),
                invoiceInputTaxIds,
                setInvoiceInputTaxIds,
              )}
            </Field>
            <Field label="Withholding rules">
              {selectTaxRules(
                activePurchaseRules.filter(
                  (rule) => rule.kind === "WITHHOLDING",
                ),
                invoiceWithholdingIds,
                setInvoiceWithholdingIds,
              )}
            </Field>
            <Field
              label="Tax treatment reason"
              hint="Required when no tax rules are selected."
            >
              <input
                value={invoiceTaxReason}
                onChange={(event) => setInvoiceTaxReason(event.target.value)}
                maxLength={240}
                className={inputClass}
              />
            </Field>
            <div className="flex items-end">
              <button
                type="submit"
                className={buttonClass}
                disabled={
                  createInvoiceMutation.isPending ||
                  receiptQuery.isError ||
                  returnQuery.isError ||
                  !receiptOptions.length
                }
              >
                {createInvoiceMutation.isPending ? "Saving…" : "Save invoice"}
              </button>
            </div>
            <ErrorNotice error={receiptQuery.error ?? returnQuery.error} />
          </form>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-3 pr-4">Invoice</th>
                <th className="py-3 pr-4">Supplier</th>
                <th className="py-3 pr-4">Status / match</th>
                <th className="py-3 pr-4">Gross</th>
                <th className="py-3 pr-4">AP due</th>
                <th className="py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="align-top">
                  <td className="py-3 pr-4">
                    <p className="font-semibold">{invoice.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {dateValue(invoice.invoiceDate)}
                    </p>
                  </td>
                  <td className="py-3 pr-4">{invoice.Supplier.name}</td>
                  <td className="py-3 pr-4">
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge
                        tone={
                          invoice.status === "PAID"
                            ? "success"
                            : invoice.status === "HELD"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {invoice.status}
                      </StatusBadge>
                      <StatusBadge
                        tone={
                          invoice.matchStatus === "MATCHED"
                            ? "success"
                            : "warning"
                        }
                      >
                        {invoice.matchStatus}
                      </StatusBadge>
                    </div>
                    {Array.isArray(invoice.matchExceptions) &&
                    invoice.matchExceptions.length > 0 ? (
                      <p className="mt-1 max-w-xs text-xs text-amber-700">
                        {invoice.matchExceptions.length} matching exception(s)
                      </p>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4">
                    {money(invoice.grossAmount, invoice.currencyCode)}
                  </td>
                  <td className="py-3 pr-4">
                    {money(
                      outstandingForInvoice(invoice),
                      invoice.currencyCode,
                    )}
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      {canApprove &&
                      (invoice.status === "PENDING_APPROVAL" ||
                        invoice.status === "HELD") ? (
                        <button
                          type="button"
                          className={secondaryButtonClass}
                          onClick={() => onApproveInvoice(invoice.id)}
                        >
                          Approve
                        </button>
                      ) : null}
                      {canPost && invoice.status === "APPROVED" ? (
                        <button
                          type="button"
                          className={secondaryButtonClass}
                          onClick={() => onPostInvoice(invoice.id)}
                        >
                          Post to AP
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!invoices.length ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No supplier invoices have been recorded.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Supplier payments
            </h2>
            <p className="text-sm text-muted-foreground">
              Allocations and withholding are recorded in the same journal
              transaction.
            </p>
          </div>
          {canPost ? (
            <button
              type="button"
              className={buttonClass}
              onClick={() => {
                setShowPaymentForm((visible) => !visible);
                setFormError(null);
              }}
            >
              {showPaymentForm ? "Close payment form" : "Record payment"}
            </button>
          ) : null}
        </div>
        {showPaymentForm && canPost ? (
          <form
            onSubmit={submitPayment}
            className="grid gap-4 rounded-2xl border border-border p-4 md:grid-cols-2"
          >
            <Field label="Supplier">
              <select
                required
                value={paymentSupplierId}
                onChange={(event) => {
                  setPaymentSupplierId(event.target.value);
                  setPaymentAllocations([
                    { invoiceId: "", allocatedGross: "" },
                  ]);
                }}
                className={inputClass}
              >
                <option value="">Select supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Payment date">
              <input
                required
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Method">
              <select
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(event.target.value as typeof paymentMethod)
                }
                className={inputClass}
              >
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CASH">Cash</option>
                <option value="CHECK">Check</option>
                <option value="OTHER">Other</option>
              </select>
            </Field>
            <Field label="Payment reference (optional)">
              <input
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
                maxLength={120}
                className={inputClass}
              />
            </Field>
            {paymentAllocations.map((allocation, index) => (
              <div
                key={index}
                className="grid gap-3 rounded-xl border border-border p-3 md:col-span-2 md:grid-cols-3"
              >
                <Field label={`Invoice allocation ${index + 1}`}>
                  <select
                    required
                    value={allocation.invoiceId}
                    onChange={(event) =>
                      setPaymentAllocations((current) =>
                        current.map((entry, rowIndex) =>
                          rowIndex === index
                            ? { ...entry, invoiceId: event.target.value }
                            : entry,
                        ),
                      )
                    }
                    className={inputClass}
                  >
                    <option value="">Select unpaid invoice</option>
                    {supplierPaymentInvoices
                      .filter(
                        (invoice) =>
                          invoice.id === allocation.invoiceId ||
                          !paymentAllocations.some(
                            (other, rowIndex) =>
                              rowIndex !== index &&
                              other.invoiceId === invoice.id,
                          ),
                      )
                      .map((invoice) => (
                        <option key={invoice.id} value={invoice.id}>
                          {invoice.invoiceNumber} ·{" "}
                          {money(
                            outstandingForInvoice(invoice),
                            invoice.currencyCode,
                          )}{" "}
                          due
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Gross allocation">
                  <input
                    required
                    type="number"
                    min="0.000001"
                    step="0.000001"
                    value={allocation.allocatedGross}
                    onChange={(event) =>
                      setPaymentAllocations((current) =>
                        current.map((entry, rowIndex) =>
                          rowIndex === index
                            ? { ...entry, allocatedGross: event.target.value }
                            : entry,
                        ),
                      )
                    }
                    className={inputClass}
                  />
                </Field>
                {paymentAllocations.length > 1 ? (
                  <div className="flex items-end">
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      onClick={() =>
                        setPaymentAllocations((current) =>
                          current.filter((_, rowIndex) => rowIndex !== index),
                        )
                      }
                    >
                      Remove allocation
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
            <div className="flex flex-wrap gap-3 md:col-span-2">
              <button
                type="button"
                className={secondaryButtonClass}
                disabled={
                  !supplierPaymentInvoices.some(
                    (invoice) =>
                      !paymentAllocations.some(
                        (allocation) => allocation.invoiceId === invoice.id,
                      ),
                  )
                }
                onClick={() =>
                  setPaymentAllocations((current) => [
                    ...current,
                    { invoiceId: "", allocatedGross: "" },
                  ])
                }
              >
                Add invoice allocation
              </button>
              <button
                type="submit"
                className={buttonClass}
                disabled={createPaymentMutation.isPending}
              >
                {createPaymentMutation.isPending ? "Saving…" : "Save payment"}
              </button>
            </div>
          </form>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-3 pr-4">Date / reference</th>
                <th className="py-3 pr-4">Supplier</th>
                <th className="py-3 pr-4">Allocations</th>
                <th className="py-3">Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="py-3 pr-4">
                    {dateValue(payment.paymentDate)}
                    <p className="text-xs text-muted-foreground">
                      {payment.reference ?? payment.method}
                    </p>
                  </td>
                  <td className="py-3 pr-4">{payment.Supplier.name}</td>
                  <td className="py-3 pr-4">
                    {payment.Allocations.map((allocation) => (
                      <p key={allocation.id}>
                        {allocation.Invoice.invoiceNumber}:{" "}
                        {money(
                          allocation.allocatedAmount,
                          allocation.Invoice.currencyCode,
                        )}
                        {Number(allocation.withholdingAmount) > 0
                          ? ` (withheld ${money(allocation.withholdingAmount, allocation.Invoice.currencyCode)})`
                          : ""}
                      </p>
                    ))}
                  </td>
                  <td className="py-3">
                    {money(payment.amount, payment.currencyCode)}
                  </td>
                </tr>
              ))}
              {!payments.length ? (
                <tr>
                  <td
                    colSpan={4}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No supplier payments have been recorded.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function CreditNotesPanel({
  invoices,
  notes,
  taxRules,
  canManage,
  canApprove,
  canPost,
  loadingOptions,
  onCreate,
  onApprove,
  onPost,
  actionError,
}: {
  invoices: SupplierInvoice[];
  notes: Awaited<ReturnType<typeof getSupplierCreditNotes>>;
  taxRules: Awaited<ReturnType<typeof getTaxRules>>;
  canManage: boolean;
  canApprove: boolean;
  canPost: boolean;
  loadingOptions: boolean;
  onCreate: Parameters<typeof createSupplierCreditNote>[0] extends infer T
    ? (input: T) => Promise<void>
    : never;
  onApprove: (id: string) => void;
  onPost: (id: string) => void;
  actionError: unknown;
}) {
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<"NON_RETURN" | "RETURN">("NON_RETURN");
  const [invoiceId, setInvoiceId] = useState("");
  const [invoiceLineId, setInvoiceLineId] = useState("");
  const [returnItemId, setReturnItemId] = useState("");
  const [creditNumber, setCreditNumber] = useState("");
  const [reason, setReason] = useState("");
  const [claimReference, setClaimReference] = useState("");
  const [allocationType, setAllocationType] = useState<
    "INVENTORY" | "COST_OF_GOODS_SOLD" | "PURCHASE_DISCOUNT" | "NON_INVENTORY"
  >("COST_OF_GOODS_SOLD");
  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState("");
  const [inputTaxIds, setInputTaxIds] = useState<string[]>([]);
  const [withholdingIds, setWithholdingIds] = useState<string[]>([]);
  const [taxReason, setTaxReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const createMutation = useMutation({
    mutationFn: onCreate,
    retry: 0,
    onSuccess: () => {
      setShowForm(false);
      setCreditNumber("");
      setReason("");
      setClaimReference("");
      setAmount("");
      setQuantity("");
      setReturnItemId("");
      setFormError(null);
    },
    onError: (error) => setFormError(messageFor(error)),
  });

  const invoice = invoices.find((entry) => entry.id === invoiceId);
  const invoiceLine = invoice?.Lines.find((line) => line.id === invoiceLineId);
  const purchaseOrderId =
    invoiceLine?.ReceiptItem?.Receipt?.PurchaseOrder?.id ?? "";
  const returnQuery = useQuery({
    queryKey: ["finance", "credit-note-returns", purchaseOrderId],
    queryFn: () =>
      getPurchaseOrderReturns(
        useAuthStore.getState().accessToken as string,
        purchaseOrderId,
        0,
        100,
      ),
    enabled: Boolean(type === "RETURN" && purchaseOrderId),
    staleTime: 30_000,
  });
  const selectedReturnOptions: ReturnLineOption[] = (
    returnQuery.data?.data ?? []
  ).flatMap((record) =>
    record.Items.filter(
      (item) =>
        item.receiptItemId === invoiceLine?.receiptItemId &&
        Number(item.invoicedQuantity) > 0,
    ).map((item) => ({ returnId: record.id, item })),
  );
  const selectedReturn = selectedReturnOptions.find(
    (option) => option.item.id === returnItemId,
  );
  const returnableQuantity = (itemId: string) => {
    const alreadyCredited = notes
      .filter((note) => note.status !== "VOID")
      .flatMap((note) => note.Lines)
      .filter((line) => line.returnItemId === itemId)
      .reduce((total, line) => total + Number(line.quantity ?? 0), 0);
    const item = selectedReturnOptions.find(
      (option) => option.item.id === itemId,
    )?.item;
    return Math.max(0, Number(item?.invoicedQuantity ?? 0) - alreadyCredited);
  };
  const transactionType =
    type === "RETURN" ? "SUPPLIER_RETURN_CREDIT_NOTE" : "SUPPLIER_CREDIT_NOTE";
  const activeRules = taxRules.filter(
    (rule) => rule.isActive && rule.transactionType === transactionType,
  );

  function submitCreditNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!invoice || !invoiceLine) {
      setFormError("Select the source invoice and invoice line.");
      return;
    }
    const isReturn = type === "RETURN";
    if (isReturn && !selectedReturn) {
      setFormError("Select an invoiced item from a recorded physical return.");
      return;
    }
    const effectiveAmount = isReturn
      ? Number(quantity) * Number(selectedReturn?.item.unitPrice ?? 0)
      : Number(amount);
    createMutation.mutate({
      supplierId: invoice.Supplier.id,
      invoiceId: invoice.id,
      ...(isReturn && selectedReturn
        ? { purchaseOrderReturnId: selectedReturn.returnId }
        : {}),
      creditNumber: creditNumber.trim(),
      type,
      reason: reason.trim(),
      ...(!isReturn && claimReference.trim()
        ? { claimReference: claimReference.trim() }
        : {}),
      lines: [
        {
          allocationType: isReturn ? "INVENTORY" : allocationType,
          amount: effectiveAmount,
          ...(isReturn || allocationType === "INVENTORY"
            ? { quantity: Number(quantity) }
            : {}),
          invoiceLineId: invoiceLine.id,
          receiptItemId: invoiceLine.receiptItemId,
          ...(isReturn && selectedReturn
            ? { returnItemId: selectedReturn.item.id }
            : {}),
          inputTaxRuleIds: inputTaxIds,
          withholdingRuleIds: withholdingIds,
          ...(taxReason.trim() ? { taxExemptReason: taxReason.trim() } : {}),
        },
      ],
    });
  }

  const selectRules = (
    rules: typeof taxRules,
    selected: string[],
    onChange: (values: string[]) => void,
  ) => (
    <select
      multiple
      value={selected}
      onChange={(event) =>
        onChange(
          Array.from(
            event.currentTarget.selectedOptions,
            (option) => option.value,
          ),
        )
      }
      className={`${inputClass} min-h-24`}
    >
      {rules.map((rule) => (
        <option key={rule.id} value={rule.id}>
          {rule.code} — {rule.name} ({Number(rule.rate) * 100}%)
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-5">
      <ErrorNotice error={actionError} />
      {formError ? <ErrorNotice error={formError} /> : null}
      <section className="space-y-4 rounded-3xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Supplier credit notes</h2>
            <p className="text-sm text-muted-foreground">
              Non-return claims and credits tied to recorded physical PO
              returns.
            </p>
          </div>
          {canManage ? (
            <button
              type="button"
              className={buttonClass}
              onClick={() => setShowForm((visible) => !visible)}
            >
              {showForm ? "Close form" : "Create credit note"}
            </button>
          ) : null}
        </div>
        {showForm && canManage ? (
          <form
            onSubmit={submitCreditNote}
            className="grid gap-4 md:grid-cols-2"
          >
            <Field label="Credit note type">
              <select
                value={type}
                onChange={(event) => {
                  setType(event.target.value as typeof type);
                  setReturnItemId("");
                  setInputTaxIds([]);
                  setWithholdingIds([]);
                }}
                className={inputClass}
              >
                <option value="NON_RETURN">Non-return / supplier claim</option>
                <option value="RETURN">Physical PO return</option>
              </select>
            </Field>
            <Field label="Source invoice">
              <select
                required
                value={invoiceId}
                onChange={(event) => {
                  setInvoiceId(event.target.value);
                  setInvoiceLineId("");
                  setReturnItemId("");
                }}
                className={inputClass}
                disabled={loadingOptions}
              >
                <option value="">Select posted invoice</option>
                {invoices
                  .filter((entry) => INVOICE_STATUSES.includes(entry.status))
                  .map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.invoiceNumber} · {entry.Supplier.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Invoice line">
              <select
                required
                value={invoiceLineId}
                onChange={(event) => {
                  setInvoiceLineId(event.target.value);
                  setReturnItemId("");
                }}
                className={inputClass}
              >
                <option value="">Select source invoice line</option>
                {(invoice?.Lines ?? []).map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.ReceiptItem?.Receipt?.PurchaseOrder?.poNumber ??
                      line.receiptItemId}{" "}
                    · {money(line.subtotal, invoice?.currencyCode ?? "IDR")}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Credit note number">
              <input
                required
                maxLength={80}
                value={creditNumber}
                onChange={(event) => setCreditNumber(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Reason">
              <input
                required
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className={inputClass}
              />
            </Field>
            {type === "NON_RETURN" ? (
              <>
                <Field label="Claim reference">
                  <input
                    required
                    maxLength={120}
                    value={claimReference}
                    onChange={(event) => setClaimReference(event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Accounting allocation">
                  <select
                    value={allocationType}
                    onChange={(event) =>
                      setAllocationType(
                        event.target.value as typeof allocationType,
                      )
                    }
                    className={inputClass}
                  >
                    <option value="COST_OF_GOODS_SOLD">
                      Consumed goods / COGS
                    </option>
                    <option value="INVENTORY">Inventory still on hand</option>
                    <option value="PURCHASE_DISCOUNT">Purchase discount</option>
                    <option value="NON_INVENTORY">Non-inventory expense</option>
                  </select>
                </Field>
                <Field label="Credit amount">
                  <input
                    required
                    type="number"
                    min="0.000001"
                    step="0.000001"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    className={inputClass}
                  />
                </Field>
                {allocationType === "INVENTORY" ? (
                  <Field label="Quantity covered by the inventory adjustment">
                    <input
                      required
                      type="number"
                      min="0.000001"
                      max={invoiceLine?.quantity}
                      step="0.000001"
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                      className={inputClass}
                    />
                  </Field>
                ) : null}
              </>
            ) : (
              <>
                <Field label="Returned receipt item">
                  <select
                    required
                    value={returnItemId}
                    onChange={(event) => {
                      setReturnItemId(event.target.value);
                      setQuantity("");
                    }}
                    className={inputClass}
                    disabled={!purchaseOrderId || returnQuery.isPending}
                  >
                    <option value="">Select invoiced physical return</option>
                    {selectedReturnOptions.map(({ returnId, item }) => {
                      const alreadyCredited = notes
                        .filter((note) => note.status !== "VOID")
                        .flatMap((note) => note.Lines)
                        .filter((line) => line.returnItemId === item.id)
                        .reduce(
                          (total, line) => total + Number(line.quantity ?? 0),
                          0,
                        );
                      const available =
                        Number(item.invoicedQuantity) - alreadyCredited;
                      return available > 0 ? (
                        <option key={item.id} value={item.id}>
                          Return {returnId.slice(0, 8)} · {available} available
                        </option>
                      ) : null;
                    })}
                  </select>
                </Field>
                <Field
                  label="Return quantity"
                  hint={
                    selectedReturn
                      ? `Maximum ${returnableQuantity(selectedReturn.item.id)}`
                      : undefined
                  }
                >
                  <input
                    required
                    type="number"
                    min="0.000001"
                    max={
                      selectedReturn
                        ? returnableQuantity(selectedReturn.item.id)
                        : undefined
                    }
                    step="0.000001"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <p className="self-end text-sm text-muted-foreground">
                  Credit amount:{" "}
                  {selectedReturn
                    ? money(
                        Number(quantity || 0) *
                          Number(selectedReturn.item.unitPrice),
                        invoice?.currencyCode ?? "IDR",
                      )
                    : "—"}
                </p>
              </>
            )}
            <Field label="Input-tax correction rules">
              {selectRules(
                activeRules.filter((rule) => rule.kind === "INPUT_TAX"),
                inputTaxIds,
                setInputTaxIds,
              )}
            </Field>
            <Field label="Withholding correction rules">
              {selectRules(
                activeRules.filter((rule) => rule.kind === "WITHHOLDING"),
                withholdingIds,
                setWithholdingIds,
              )}
            </Field>
            <Field label="Tax treatment reason">
              <input
                value={taxReason}
                onChange={(event) => setTaxReason(event.target.value)}
                maxLength={240}
                className={inputClass}
              />
            </Field>
            <div className="flex items-end gap-3">
              <button
                type="submit"
                className={buttonClass}
                disabled={
                  createMutation.isPending ||
                  returnQuery.isError ||
                  (type === "RETURN" && !selectedReturn)
                }
              >
                {createMutation.isPending ? "Saving…" : "Save credit note"}
              </button>
              <ErrorNotice error={returnQuery.error} />
            </div>
          </form>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-3 pr-4">Credit note</th>
                <th className="py-3 pr-4">Supplier / invoice</th>
                <th className="py-3 pr-4">Type / status</th>
                <th className="py-3 pr-4">Gross</th>
                <th className="py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {notes.map((note) => (
                <tr key={note.id}>
                  <td className="py-3 pr-4">
                    <p className="font-semibold">{note.creditNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {note.reason}
                    </p>
                  </td>
                  <td className="py-3 pr-4">
                    {note.Supplier.name}
                    <p className="text-xs text-muted-foreground">
                      {note.Invoice?.invoiceNumber ?? "Physical return"}
                    </p>
                  </td>
                  <td className="py-3 pr-4">
                    <StatusBadge tone="neutral">{note.type}</StatusBadge>{" "}
                    <StatusBadge
                      tone={note.status === "POSTED" ? "success" : "warning"}
                    >
                      {note.status}
                    </StatusBadge>
                  </td>
                  <td className="py-3 pr-4">
                    {money(note.grossAmount, note.currencyCode)}
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      {canApprove && note.status === "PENDING_APPROVAL" ? (
                        <button
                          type="button"
                          className={secondaryButtonClass}
                          onClick={() => onApprove(note.id)}
                        >
                          Approve
                        </button>
                      ) : null}
                      {canPost && note.status === "APPROVED" ? (
                        <button
                          type="button"
                          className={secondaryButtonClass}
                          onClick={() => onPost(note.id)}
                        >
                          Post
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!notes.length ? (
                <tr>
                  <td
                    colSpan={5}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No supplier credit notes have been recorded.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function JournalPanel({
  entries,
  isLoading,
  error,
}: {
  entries: Awaited<ReturnType<typeof getJournalEntries>>;
  isLoading: boolean;
  error: unknown;
}) {
  if (isLoading) {
    return <div className="h-56 animate-pulse rounded-3xl bg-muted" />;
  }
  if (error) {
    return (
      <UnavailableState
        title="Unable to load journals"
        description={messageFor(error)}
      />
    );
  }
  return (
    <section className="space-y-4 rounded-3xl border border-border bg-card p-5">
      <div>
        <h2 className="text-lg font-semibold">Posted journal entries</h2>
        <p className="text-sm text-muted-foreground">
          Source-linked, balanced journal entries for the selected tenant.
        </p>
      </div>
      <div className="space-y-3">
        {entries.map((entry) => (
          <details
            key={entry.id}
            className="rounded-2xl border border-border p-4"
          >
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3">
              <span>
                <strong>{entry.number}</strong> · {entry.memo}
                <span className="ml-2 text-xs text-muted-foreground">
                  {entry.sourceType} · {dateValue(entry.entryDate)}
                </span>
              </span>
              <StatusBadge
                tone={entry.status === "POSTED" ? "success" : "neutral"}
              >
                {entry.status}
              </StatusBadge>
            </summary>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">Account</th>
                    <th className="py-2 pr-3">Description</th>
                    <th className="py-2 pr-3 text-right">Debit</th>
                    <th className="py-2 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.Lines.map((line) => (
                    <tr key={line.id} className="border-t border-border">
                      <td className="py-2 pr-3">
                        {line.Account.code} · {line.Account.name}
                      </td>
                      <td className="py-2 pr-3">{line.description ?? "—"}</td>
                      <td className="py-2 pr-3 text-right">
                        {money(line.debit, entry.currencyCode)}
                      </td>
                      <td className="py-2 text-right">
                        {money(line.credit, entry.currencyCode)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">
                Period: {entry.Period.name} ({entry.Period.status}) · Source ID:{" "}
                {entry.sourceId}
              </p>
            </div>
          </details>
        ))}
        {!entries.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No journal entries have been posted.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function AccountingSetupPanel({
  accounts,
  periods,
  settings,
  taxRules,
  isLoading,
  error,
  onRefresh,
}: {
  accounts: Awaited<ReturnType<typeof getAccountingAccounts>>;
  periods: Awaited<ReturnType<typeof getAccountingPeriods>>;
  settings: Awaited<ReturnType<typeof getAccountingSettings>> | undefined;
  taxRules: Awaited<ReturnType<typeof getTaxRules>>;
  isLoading: boolean;
  error: unknown;
  onRefresh: () => Promise<void>;
}) {
  const [accountCode, setAccountCode] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] =
    useState<AccountingAccountType>("ASSET");
  const [periodName, setPeriodName] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [taxCode, setTaxCode] = useState("");
  const [taxName, setTaxName] = useState("");
  const [taxKind, setTaxKind] = useState<"INPUT_TAX" | "WITHHOLDING">(
    "INPUT_TAX",
  );
  const [taxTransaction, setTaxTransaction] = useState("SUPPLIER_PURCHASE");
  const [taxCategory, setTaxCategory] = useState("");
  const [taxSupplierStatus, setTaxSupplierStatus] = useState("");
  const [taxJurisdiction, setTaxJurisdiction] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [taxTiming, setTaxTiming] = useState<"INVOICE" | "PAYMENT">("INVOICE");
  const [taxEffectiveFrom, setTaxEffectiveFrom] = useState(todayDate);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const session = useAuthStore((state) => state.session);
  const tenantId = session?.tenantId;
  const canManage = hasPermission(session, "finance.manage");

  const refresh = async () => {
    await onRefresh();
    if (tenantId) {
      await queryClient.invalidateQueries({
        queryKey: [...financeKeys.all(tenantId), "accounts"],
      });
      await queryClient.invalidateQueries({
        queryKey: [...financeKeys.all(tenantId), "periods"],
      });
      await queryClient.invalidateQueries({
        queryKey: [...financeKeys.all(tenantId), "tax-rules"],
      });
    }
  };
  const mutationOptions = {
    retry: 0,
    onSuccess: async () => {
      setErrorMessage(null);
      await refresh();
    },
    onError: (cause: unknown) => setErrorMessage(messageFor(cause)),
  };
  const createAccountMutation = useMutation({
    mutationFn: createAccountingAccount,
    ...mutationOptions,
    onSuccess: async () => {
      setAccountCode("");
      setAccountName("");
      await mutationOptions.onSuccess();
    },
  });
  const mapAccountMutation = useMutation({
    mutationFn: mapAccountingAccount,
    ...mutationOptions,
  });
  const createPeriodMutation = useMutation({
    mutationFn: createAccountingPeriod,
    ...mutationOptions,
    onSuccess: async () => {
      setPeriodName("");
      setPeriodStart("");
      setPeriodEnd("");
      await mutationOptions.onSuccess();
    },
  });
  const closePeriodMutation = useMutation({
    mutationFn: closeAccountingPeriod,
    ...mutationOptions,
  });
  const settingsMutation = useMutation({
    mutationFn: updateAccountingSettings,
    ...mutationOptions,
  });
  const createTaxMutation = useMutation({
    mutationFn: createTaxRule,
    ...mutationOptions,
    onSuccess: async () => {
      setTaxCode("");
      setTaxName("");
      setTaxRate("");
      await mutationOptions.onSuccess();
    },
  });

  const mappings = useMemo(
    () =>
      new Map(
        accounts.flatMap((account) =>
          account.Mappings.map(
            (mapping) => [mapping.role, account.id] as const,
          ),
        ),
      ),
    [accounts],
  );

  if (isLoading) {
    return <div className="h-56 animate-pulse rounded-3xl bg-muted" />;
  }
  if (error) {
    return (
      <UnavailableState
        title="Unable to load accounting setup"
        description={messageFor(error)}
      />
    );
  }
  if (!canManage) {
    return (
      <UnavailableState
        title="Setup changes are restricted"
        description="Your current role does not include finance.manage."
      />
    );
  }

  return (
    <div className="space-y-5">
      <ErrorNotice error={errorMessage} />
      <section className="rounded-3xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">Posting policy</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Approval is required by default. Matched invoices can be configured
          for automatic posting.
        </p>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings?.invoiceApprovalRequired ?? true}
              disabled={!settings}
              onChange={(event) =>
                settingsMutation.mutate({
                  invoiceApprovalRequired: event.target.checked,
                  autoPostMatchedInvoices:
                    settings?.autoPostMatchedInvoices ?? false,
                })
              }
            />
            Require invoice approval
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings?.autoPostMatchedInvoices ?? false}
              disabled={!settings}
              onChange={(event) =>
                settingsMutation.mutate({
                  invoiceApprovalRequired:
                    settings?.invoiceApprovalRequired ?? true,
                  autoPostMatchedInvoices: event.target.checked,
                })
              }
            />
            Auto-post matched invoices
          </label>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-4 rounded-3xl border border-border bg-card p-5">
          <div>
            <h2 className="text-lg font-semibold">Chart of accounts</h2>
            <p className="text-sm text-muted-foreground">
              Create tenant accounts and map each required posting role.
            </p>
          </div>
          <form
            className="grid gap-3 sm:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              createAccountMutation.mutate({
                code: accountCode.trim(),
                name: accountName.trim(),
                type: accountType,
              });
            }}
          >
            <Field label="Code">
              <input
                required
                maxLength={32}
                value={accountCode}
                onChange={(event) => setAccountCode(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Name">
              <input
                required
                maxLength={120}
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Type">
              <select
                value={accountType}
                onChange={(event) =>
                  setAccountType(event.target.value as AccountingAccountType)
                }
                className={inputClass}
              >
                {ACCOUNT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>
            <button
              type="submit"
              className={`${buttonClass} sm:col-span-3`}
              disabled={createAccountMutation.isPending}
            >
              Create account
            </button>
          </form>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Mapped account</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ACCOUNT_ROLES.map((role) => {
                  const mappedId = mappings.get(role) ?? "";
                  return (
                    <tr key={role}>
                      <td className="py-2 pr-3 font-medium">{role}</td>
                      <td className="py-2 pr-3">
                        <select
                          value={mappedId}
                          onChange={(event) =>
                            mapAccountMutation.mutate({
                              role,
                              accountId: event.target.value,
                            })
                          }
                          className={inputClass}
                        >
                          <option value="" disabled={Boolean(mappedId)}>
                            Not mapped
                          </option>
                          {accounts
                            .filter((account) => account.isActive)
                            .map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.code} · {account.name} ({account.type})
                              </option>
                            ))}
                        </select>
                      </td>
                      <td className="py-2">
                        <StatusBadge tone={mappedId ? "success" : "warning"}>
                          {mappedId ? "Mapped" : "Required"}
                        </StatusBadge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4 rounded-3xl border border-border bg-card p-5">
          <div>
            <h2 className="text-lg font-semibold">Accounting periods</h2>
            <p className="text-sm text-muted-foreground">
              Posting is permitted only in an open period covering the entry
              date.
            </p>
          </div>
          <form
            className="grid gap-3 sm:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              createPeriodMutation.mutate({
                name: periodName.trim(),
                startsAt: periodStart,
                endsAt: periodEnd,
              });
            }}
          >
            <Field label="Period name">
              <input
                required
                maxLength={80}
                value={periodName}
                onChange={(event) => setPeriodName(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Starts">
              <input
                required
                type="date"
                value={periodStart}
                onChange={(event) => setPeriodStart(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Ends">
              <input
                required
                type="date"
                value={periodEnd}
                onChange={(event) => setPeriodEnd(event.target.value)}
                className={inputClass}
              />
            </Field>
            <button
              type="submit"
              className={`${buttonClass} sm:col-span-3`}
              disabled={createPeriodMutation.isPending}
            >
              Create period
            </button>
          </form>
          <ul className="divide-y divide-border">
            {periods.map((period) => (
              <li
                key={period.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <span>
                  <strong>{period.name}</strong>
                  <span className="ml-2 text-muted-foreground">
                    {dateValue(period.startsAt)} — {dateValue(period.endsAt)}
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <StatusBadge
                    tone={period.status === "OPEN" ? "success" : "neutral"}
                  >
                    {period.status}
                  </StatusBadge>
                  {period.status === "OPEN" ? (
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      disabled={closePeriodMutation.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Close accounting period ${period.name}?`,
                          )
                        ) {
                          closePeriodMutation.mutate(period.id);
                        }
                      }}
                    >
                      Close
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-border bg-card p-5">
        <div>
          <h2 className="text-lg font-semibold">Tax rules</h2>
          <p className="text-sm text-muted-foreground">
            Explicit tenant rules by transaction, category, supplier status,
            jurisdiction, and effective dates. Rates are entered as a
            percentage.
          </p>
        </div>
        <form
          className="grid gap-3 md:grid-cols-3 xl:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            createTaxMutation.mutate({
              code: taxCode.trim(),
              name: taxName.trim(),
              kind: taxKind,
              transactionType: taxTransaction.trim(),
              ...(taxCategory.trim()
                ? { taxCategory: taxCategory.trim() }
                : {}),
              ...(taxSupplierStatus.trim()
                ? { supplierTaxStatus: taxSupplierStatus.trim() }
                : {}),
              ...(taxJurisdiction.trim()
                ? { jurisdiction: taxJurisdiction.trim() }
                : {}),
              rate: Number(taxRate) / 100,
              ...(taxKind === "WITHHOLDING"
                ? { withholdingTiming: taxTiming }
                : {}),
              effectiveFrom: taxEffectiveFrom,
            });
          }}
        >
          <Field label="Code">
            <input
              required
              maxLength={40}
              value={taxCode}
              onChange={(event) => setTaxCode(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Name">
            <input
              required
              maxLength={120}
              value={taxName}
              onChange={(event) => setTaxName(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Kind">
            <select
              value={taxKind}
              onChange={(event) =>
                setTaxKind(event.target.value as typeof taxKind)
              }
              className={inputClass}
            >
              <option value="INPUT_TAX">Input tax</option>
              <option value="WITHHOLDING">Withholding</option>
            </select>
          </Field>
          <Field label="Transaction type">
            <select
              value={taxTransaction}
              onChange={(event) => setTaxTransaction(event.target.value)}
              className={inputClass}
            >
              <option value="SUPPLIER_PURCHASE">Supplier purchase</option>
              <option value="SUPPLIER_CREDIT_NOTE">Supplier credit note</option>
              <option value="SUPPLIER_RETURN_CREDIT_NOTE">
                Supplier return credit note
              </option>
            </select>
          </Field>
          <Field label="Tax category (optional)">
            <input
              value={taxCategory}
              onChange={(event) => setTaxCategory(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Supplier tax status (optional)">
            <input
              value={taxSupplierStatus}
              onChange={(event) => setTaxSupplierStatus(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Jurisdiction (optional)">
            <input
              value={taxJurisdiction}
              onChange={(event) => setTaxJurisdiction(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Rate (%)">
            <input
              required
              type="number"
              min="0"
              max="100"
              step="0.000001"
              value={taxRate}
              onChange={(event) => setTaxRate(event.target.value)}
              className={inputClass}
            />
          </Field>
          {taxKind === "WITHHOLDING" ? (
            <Field label="Recognition timing">
              <select
                value={taxTiming}
                onChange={(event) =>
                  setTaxTiming(event.target.value as typeof taxTiming)
                }
                className={inputClass}
              >
                <option value="INVOICE">At invoice</option>
                <option value="PAYMENT">At payment</option>
              </select>
            </Field>
          ) : null}
          <Field label="Effective from">
            <input
              required
              type="date"
              value={taxEffectiveFrom}
              onChange={(event) => setTaxEffectiveFrom(event.target.value)}
              className={inputClass}
            />
          </Field>
          <button
            type="submit"
            className={`${buttonClass} self-end`}
            disabled={createTaxMutation.isPending}
          >
            Create tax rule
          </button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Rule</th>
                <th className="py-2 pr-3">Applies to</th>
                <th className="py-2 pr-3">Rate</th>
                <th className="py-2 pr-3">Timing</th>
                <th className="py-2">Validity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {taxRules.map((rule) => (
                <tr key={rule.id}>
                  <td className="py-2 pr-3">
                    {rule.code} · {rule.name}
                  </td>
                  <td className="py-2 pr-3">
                    {rule.kind} / {rule.transactionType}
                  </td>
                  <td className="py-2 pr-3">{Number(rule.rate) * 100}%</td>
                  <td className="py-2 pr-3">{rule.withholdingTiming ?? "—"}</td>
                  <td className="py-2">
                    {dateValue(rule.effectiveFrom)} —{" "}
                    {rule.effectiveTo ? dateValue(rule.effectiveTo) : "open"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
