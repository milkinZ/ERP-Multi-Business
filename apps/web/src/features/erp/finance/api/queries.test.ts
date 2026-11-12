import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "@/lib/api/client";
import {
  approveSupplierCreditNote,
  approveSupplierInvoice,
  createSupplierCreditNote,
  createSupplierInvoice,
  createSupplierPayment,
  financeKeys,
  getSupplierInvoices,
  postSupplierInvoice,
} from "./queries";

vi.mock("@/lib/api/client", () => ({
  apiRequest: vi.fn(),
}));

const mockedApiRequest = vi.mocked(apiRequest);

describe("supplier finance API", () => {
  beforeEach(() => {
    mockedApiRequest.mockResolvedValue(undefined as never);
    vi.spyOn(crypto, "randomUUID").mockReturnValue("finance-idempotency-key");
  });

  it("uses a stable tenant-scoped key and fetches invoice lists", async () => {
    await getSupplierInvoices();

    expect(mockedApiRequest).toHaveBeenCalledWith(
      "/finance/supplier-invoices?skip=0&take=100",
    );
    expect(financeKeys.invoices("tenant-a")).toEqual([
      "finance",
      "tenant-a",
      "invoices",
    ]);
  });

  it("sends invoice creation with an idempotency key and the selected match lines", async () => {
    const input = {
      supplierId: "supplier-a",
      invoiceNumber: "INV-001",
      invoiceDate: "2026-11-06",
      lines: [
        {
          receiptItemId: "receipt-item-a",
          quantity: 2,
          unitPrice: 25,
          inputTaxRuleIds: [],
          withholdingRuleIds: [],
          taxExemptReason: "No applicable rule",
        },
      ],
    };

    await createSupplierInvoice(input);

    expect(mockedApiRequest).toHaveBeenCalledWith(
      "/finance/supplier-invoices",
      {
        method: "POST",
        headers: { "Idempotency-Key": "finance-idempotency-key" },
        body: JSON.stringify(input),
      },
    );
  });

  it("sends payment and credit note mutations with idempotency keys", async () => {
    const payment = {
      supplierId: "supplier-a",
      paymentDate: "2026-11-07",
      method: "BANK_TRANSFER" as const,
      allocations: [{ invoiceId: "invoice-a", allocatedGross: 50 }],
    };
    const creditNote = {
      supplierId: "supplier-a",
      invoiceId: "invoice-a",
      creditNumber: "CN-001",
      type: "NON_RETURN" as const,
      reason: "Approved price claim",
      claimReference: "CLAIM-1",
      lines: [
        {
          allocationType: "COST_OF_GOODS_SOLD" as const,
          invoiceLineId: "line-a",
          amount: 10,
          inputTaxRuleIds: [],
          withholdingRuleIds: [],
          taxExemptReason: "No applicable rule",
        },
      ],
    };

    await createSupplierPayment(payment);
    await createSupplierCreditNote(creditNote);

    expect(mockedApiRequest).toHaveBeenNthCalledWith(
      1,
      "/finance/supplier-payments",
      {
        method: "POST",
        headers: { "Idempotency-Key": "finance-idempotency-key" },
        body: JSON.stringify(payment),
      },
    );
    expect(mockedApiRequest).toHaveBeenNthCalledWith(
      2,
      "/finance/supplier-credit-notes",
      {
        method: "POST",
        headers: { "Idempotency-Key": "finance-idempotency-key" },
        body: JSON.stringify(creditNote),
      },
    );
  });

  it("uses dedicated approval and posting endpoints", async () => {
    await approveSupplierInvoice("invoice/a");
    await postSupplierInvoice("invoice-a");
    await approveSupplierCreditNote("credit-a");

    expect(mockedApiRequest).toHaveBeenNthCalledWith(
      1,
      "/finance/supplier-invoices/invoice%2Fa/approve",
      { method: "POST" },
    );
    expect(mockedApiRequest).toHaveBeenNthCalledWith(
      2,
      "/finance/supplier-invoices/invoice-a/post",
      { method: "POST" },
    );
    expect(mockedApiRequest).toHaveBeenNthCalledWith(
      3,
      "/finance/supplier-credit-notes/credit-a/approve",
      { method: "POST" },
    );
  });
});
