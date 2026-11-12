"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  PageHeader,
  StatusBadge,
  UnavailableState,
} from "@/components/data-display/states";
import { ApiError } from "@/lib/api/client";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";
import {
  billingKeys,
  createInvoiceRefund,
  enrollAutopay,
  getAutopayStatus,
  getInvoice,
  getInvoiceRefunds,
} from "@/features/erp/billing/api/queries";

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function statusTone(status: string) {
  if (status === "PAID") return "success" as const;
  if (status === "FAILED") return "danger" as const;
  if (status === "PENDING") return "warning" as const;
  return "neutral" as const;
}

export function InvoiceDetailWorkspace({ invoiceId }: { invoiceId: string }) {
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("REQUESTED_BY_CUSTOMER");
  const [autopayChannel, setAutopayChannel] = useState("");
  const [autopayConsent, setAutopayConsent] = useState(false);
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const queryClient = useQueryClient();
  const tenantId = session?.tenantId;
  const canRead = hasPermission(session, "invoice.read");
  const canRefund = hasPermission(session, "billing.execute");
  const query = useQuery({
    queryKey: tenantId
      ? billingKeys.invoice(tenantId, invoiceId)
      : ["billing", "unauthenticated", invoiceId],
    queryFn: () => getInvoice(token as string, invoiceId),
    enabled: Boolean(token && tenantId && canRead && invoiceId),
    staleTime: 30_000,
  });
  const refundsQuery = useQuery({
    queryKey: tenantId
      ? ["billing", tenantId, "refunds", invoiceId]
      : ["billing", "unauthenticated", "refunds", invoiceId],
    queryFn: () => getInvoiceRefunds(token as string, invoiceId),
    enabled: Boolean(token && tenantId && canRead && invoiceId),
  });
  const autopayQuery = useQuery({
    queryKey: tenantId
      ? ["billing", tenantId, "autopay"]
      : ["billing", "unauthenticated", "autopay"],
    queryFn: () => getAutopayStatus(token as string),
    enabled: Boolean(token && tenantId && canRefund),
    staleTime: 30_000,
  });
  const availableAutopayChannels =
    autopayQuery.data?.availableChannelCodes ?? [];
  const selectedAutopayChannel = availableAutopayChannels.includes(
    autopayChannel,
  )
    ? autopayChannel
    : (availableAutopayChannels[0] ?? "");
  const refundMutation = useMutation({
    mutationFn: () =>
      createInvoiceRefund(token as string, invoiceId, {
        amountCents: Number(refundAmount),
        reason: refundReason,
      }),
    retry: 0,
    onSuccess: async () => {
      setRefundAmount("");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: tenantId
            ? billingKeys.invoice(tenantId, invoiceId)
            : ["billing"],
        }),
        queryClient.invalidateQueries({
          queryKey: tenantId
            ? ["billing", tenantId, "refunds", invoiceId]
            : ["billing"],
        }),
        queryClient.invalidateQueries({
          queryKey: tenantId ? ["billing", tenantId] : ["billing"],
        }),
      ]);
    },
    onError: async () => {
      await queryClient.invalidateQueries({
        queryKey: tenantId
          ? ["billing", tenantId, "refunds", invoiceId]
          : ["billing"],
      });
    },
  });
  const autopayMutation = useMutation({
    mutationFn: (channelCode: string) => {
      if (!channelCode) {
        throw new Error("Select an approved payment channel before continuing");
      }
      return enrollAutopay(token as string, invoiceId, {
        channelCode,
        consent: true,
      });
    },
    retry: 0,
    onSuccess: async () => {
      setAutopayConsent(false);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: tenantId ? ["billing", tenantId, "autopay"] : ["billing"],
        }),
        queryClient.invalidateQueries({
          queryKey: tenantId
            ? billingKeys.invoice(tenantId, invoiceId)
            : ["billing"],
        }),
        queryClient.invalidateQueries({
          queryKey: tenantId
            ? billingKeys.invoices(tenantId, 0, 10)
            : ["billing"],
        }),
      ]);
    },
  });

  if (!canRead)
    return (
      <UnavailableState
        title="Invoice access is restricted"
        description="Your current tenant session does not include the invoice.read permission."
      />
    );
  if (query.isPending)
    return (
      <div className="h-72 animate-pulse rounded-[24px] bg-[var(--muted)]" />
    );
  if (query.isError) {
    const message =
      query.error instanceof ApiError && query.error.status === 404
        ? "This invoice was not found in the active tenant scope."
        : "The invoice API could not be reached. No invoice details are shown.";
    return (
      <UnavailableState title="Unable to load invoice" description={message} />
    );
  }

  const invoice = query.data;
  const reservedRefundAmount = (refundsQuery.data ?? [])
    .filter((refund) =>
      ["PENDING", "UNKNOWN", "SUCCEEDED"].includes(refund.status),
    )
    .reduce((total, refund) => total + refund.amountCents, 0);
  const remainingRefundable = Math.max(
    0,
    invoice.amountCents - reservedRefundAmount,
  );
  return (
    <>
      <PageHeader
        eyebrow="Tenant application / billing"
        title={invoice.invoiceNumber}
        description="Invoice details returned by the tenant-scoped Billing API."
        actions={
          <StatusBadge tone={statusTone(invoice.status)}>
            {invoice.status}
          </StatusBadge>
        }
      />
      <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-6">
        <dl className="grid gap-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              Invoice ID
            </dt>
            <dd className="mt-2 break-all text-sm text-[var(--foreground)]">
              {invoice.id}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              Amount
            </dt>
            <dd className="mt-2 text-sm font-semibold text-[var(--foreground)]">
              {invoice.currency} {invoice.amountCents.toLocaleString("en-US")}
            </dd>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Refunded:{" "}
              {(invoice.refundedAmountCents ?? 0).toLocaleString("en-US")} cents
            </p>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              Due
            </dt>
            <dd className="mt-2 text-sm text-[var(--foreground)]">
              {formatDate(invoice.dueAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              Paid
            </dt>
            <dd className="mt-2 text-sm text-[var(--foreground)]">
              {formatDate(invoice.paidAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              Created
            </dt>
            <dd className="mt-2 text-sm text-[var(--foreground)]">
              {formatDate(invoice.createdAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              Subscription
            </dt>
            <dd className="mt-2 break-all text-sm text-[var(--foreground)]">
              {invoice.subscriptionId ?? "Not associated"}
            </dd>
          </div>
        </dl>
        {refundsQuery.isError ? (
          <p role="alert" className="mt-5 text-sm text-[var(--danger)]">
            Refund history could not be loaded.
          </p>
        ) : null}
        {canRefund && invoice.subscriptionId && invoice.status === "PENDING" ? (
          <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-4">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">
              Set up recurring autopay
            </h2>
            {autopayQuery.isError ? (
              <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
                {autopayQuery.error instanceof ApiError
                  ? autopayQuery.error.message
                  : "Autopay availability could not be loaded."}
              </p>
            ) : null}
            {autopayQuery.data?.paymentMethod ? (
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                A {autopayQuery.data.paymentMethod.status.toLowerCase()} payment
                method is already registered for{" "}
                {autopayQuery.data.paymentMethod.channelCode}.
              </p>
            ) : autopayQuery.data?.enabled &&
              availableAutopayChannels.length > 0 ? (
              <>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  The current invoice amount will be charged during setup. If
                  you consent, the provider will save a payment token for future
                  subscription invoices. The system makes up to three charge
                  attempts total, including the first, within seven days. You
                  can revoke autopay at any time from Billing.
                </p>
                <label className="mt-3 block text-xs text-[var(--muted-foreground)]">
                  Approved payment channel
                  <select
                    value={selectedAutopayChannel}
                    onChange={(event) => setAutopayChannel(event.target.value)}
                    className="mt-1 block rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--foreground)]"
                  >
                    {availableAutopayChannels.map((channel) => (
                      <option key={channel} value={channel}>
                        {channel}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-3 flex items-start gap-2 text-xs text-[var(--foreground)]">
                  <input
                    type="checkbox"
                    checked={autopayConsent}
                    onChange={(event) =>
                      setAutopayConsent(event.target.checked)
                    }
                    className="mt-0.5"
                  />
                  <span>
                    I authorize this payment method to be saved and used for
                    future subscription invoices. I understand the current
                    invoice will be charged now and I can revoke future autopay
                    charges at any time.
                  </span>
                </label>
                <button
                  type="button"
                  disabled={
                    !autopayConsent ||
                    !selectedAutopayChannel ||
                    autopayMutation.isPending
                  }
                  onClick={() =>
                    autopayMutation.mutate(selectedAutopayChannel)
                  }
                  className="mt-3 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {autopayMutation.isPending
                    ? "Starting setup..."
                    : "Consent and set up autopay"}
                </button>
                {autopayMutation.data ? (
                  <div
                    role="status"
                    className="mt-3 space-y-2 text-sm text-[var(--foreground)]"
                  >
                    <p>
                      Provider setup status: {autopayMutation.data.status}.
                      Complete any required payment action to save the method.
                    </p>
                    {autopayMutation.data.actions.map((action) => (
                      <div
                        key={`${action.type}-${action.value}`}
                        className="rounded-lg border border-[var(--border)] p-2"
                      >
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {action.descriptor ?? action.type}
                        </p>
                        {action.value.startsWith("https://") ? (
                          <a
                            href={action.value}
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                          >
                            Continue setup
                          </a>
                        ) : (
                          <code className="mt-1 block break-all text-xs">
                            {action.value}
                          </code>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
                {autopayMutation.isError ? (
                  <p role="alert" className="mt-3 text-sm text-[var(--danger)]">
                    {autopayMutation.error instanceof ApiError
                      ? autopayMutation.error.message
                      : "Autopay setup failed or its provider outcome is unknown. Check payment status before retrying."}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                Autopay enrollment is not currently enabled by the platform
                operator.
              </p>
            )}
          </div>
        ) : null}
        {refundsQuery.data?.length ? (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">
              Refund requests
            </h2>
            <div className="mt-2 space-y-2">
              {refundsQuery.data.map((refund) => (
                <div
                  key={refund.id}
                  className="flex flex-wrap justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3 text-xs"
                >
                  <span>
                    {refund.amountCents.toLocaleString("en-US")}{" "}
                    {refund.currency} · {refund.reason}
                  </span>
                  <span>
                    {refund.status}
                    {refund.providerStatus ? ` · ${refund.providerStatus}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {canRefund &&
        refundsQuery.isSuccess &&
        ["PAID", "PARTIALLY_REFUNDED"].includes(invoice.status) &&
        remainingRefundable > 0 ? (
          <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-4">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">
              Request provider refund
            </h2>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Maximum remaining refund:{" "}
              {remainingRefundable.toLocaleString("en-US")} cents. Invoice
              status changes only after Xendit confirms success.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="text-xs text-[var(--muted-foreground)]">
                Amount in cents
                <input
                  type="number"
                  min={1}
                  max={remainingRefundable}
                  step={1}
                  value={refundAmount}
                  onChange={(event) => setRefundAmount(event.target.value)}
                  className="mt-1 block w-44 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--foreground)]"
                />
              </label>
              <label className="text-xs text-[var(--muted-foreground)]">
                Reason
                <select
                  value={refundReason}
                  onChange={(event) => setRefundReason(event.target.value)}
                  className="mt-1 block rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--foreground)]"
                >
                  <option value="REQUESTED_BY_CUSTOMER">
                    Requested by customer
                  </option>
                  <option value="DUPLICATE">Duplicate</option>
                  <option value="FRAUDULENT">Fraudulent</option>
                </select>
              </label>
              <button
                type="button"
                disabled={
                  !Number.isSafeInteger(Number(refundAmount)) ||
                  Number(refundAmount) <= 0 ||
                  Number(refundAmount) > remainingRefundable ||
                  refundMutation.isPending
                }
                onClick={() => {
                  if (
                    window.confirm(
                      `Submit a provider refund for ${Number(refundAmount).toLocaleString("en-US")} cents? The result will remain pending until confirmed by Xendit.`,
                    )
                  )
                    refundMutation.mutate();
                }}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] disabled:opacity-50"
              >
                {refundMutation.isPending ? "Submitting..." : "Request refund"}
              </button>
            </div>
            {refundMutation.isError ? (
              <p role="alert" className="mt-3 text-sm text-[var(--danger)]">
                {refundMutation.error instanceof ApiError
                  ? refundMutation.error.message
                  : "The refund request failed or its provider outcome is unknown. Check the refund history before retrying."}
              </p>
            ) : null}
          </div>
        ) : null}
        <Link
          href="/app/billing"
          className="mt-8 inline-flex rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)]"
        >
          Back to billing
        </Link>
      </section>
    </>
  );
}
