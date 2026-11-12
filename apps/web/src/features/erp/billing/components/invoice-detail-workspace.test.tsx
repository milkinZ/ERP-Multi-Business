import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  enrollAutopay,
  getAutopayStatus,
  getInvoice,
  getInvoiceRefunds,
} from "@/features/erp/billing/api/queries";
import { InvoiceDetailWorkspace } from "./invoice-detail-workspace";

vi.mock("@/stores/auth.store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      accessToken: "test-token",
      session: {
        scope: "tenant",
        userId: "user-1",
        tenantId: "tenant-1",
        permissions: ["invoice.read", "billing.execute"],
      },
    }),
}));

vi.mock("@/features/erp/billing/api/queries", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/features/erp/billing/api/queries")
    >();
  return {
    ...actual,
    enrollAutopay: vi.fn(),
    getAutopayStatus: vi.fn(),
    getInvoice: vi.fn(),
    getInvoiceRefunds: vi.fn(),
  };
});

function renderWorkspace() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <InvoiceDetailWorkspace invoiceId="invoice-1" />
    </QueryClientProvider>,
  );
}

describe("InvoiceDetailWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getInvoice).mockResolvedValue({
      id: "invoice-1",
      tenantId: "tenant-1",
      subscriptionId: "subscription-1",
      invoiceNumber: "INV-1",
      amountCents: 5000,
      currency: "IDR",
      status: "PENDING",
      createdAt: "2026-11-07T00:00:00.000Z",
      updatedAt: "2026-11-07T00:00:00.000Z",
    });
    vi.mocked(getInvoiceRefunds).mockResolvedValue([]);
    vi.mocked(getAutopayStatus).mockResolvedValue({
      enabled: true,
      availableChannelCodes: ["CARDS"],
      paymentMethod: null,
    });
    vi.mocked(enrollAutopay).mockResolvedValue({
      paymentSessionId: "payment-session-1",
      status: "PENDING",
      actions: [],
    });
  });

  it("submits the default visible channel when the selection state is empty", async () => {
    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toHaveValue("CARDS");
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: "Consent and set up autopay" }),
    );

    await waitFor(() => {
      expect(enrollAutopay).toHaveBeenCalledWith("test-token", "invoice-1", {
        channelCode: "CARDS",
        consent: true,
      });
    });
  });
});
