"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { ApiError } from "@/lib/api/client"
import { EmptyState, PageHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { hasPermission } from "@/lib/permissions"
import { cancelPlatformInvoice, getPlatformInvoice, getPlatformInvoiceRefunds, refundPlatformInvoice } from "@/features/platform/api/queries"
import { useAuthStore } from "@/stores/auth.store"

function statusTone(status: string) {
  if (status === "PAID") return "success" as const
  if (status === "FAILED") return "danger" as const
  if (status === "PENDING") return "warning" as const
  return "neutral" as const
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-"
}

export default function PlatformInvoiceDetailPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>()
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const canRead = hasPermission(session, "super-admin.read")
  const canManageBilling = hasPermission(session, "super-admin.manage.billing")
  const queryClient = useQueryClient()
  const [refundAmount, setRefundAmount] = useState("")
  const [refundReason, setRefundReason] = useState("REQUESTED_BY_CUSTOMER")
  const query = useQuery({
    queryKey: ["platform-billing-invoice", invoiceId],
    queryFn: () => getPlatformInvoice(token as string, invoiceId),
    enabled: Boolean(token && canRead && invoiceId),
  })
  const refundsQuery = useQuery({
    queryKey: ["platform-billing-invoice-refunds", invoiceId],
    queryFn: () => getPlatformInvoiceRefunds(token as string, query.data!.tenantId, invoiceId),
    enabled: Boolean(token && canRead && query.data?.tenantId),
  })
  const cancelMutation = useMutation({
    mutationFn: () => cancelPlatformInvoice(token as string, query.data!.tenantId, invoiceId),
    retry: 0,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["platform-billing-invoice", invoiceId] })
      await queryClient.invalidateQueries({ queryKey: ["platform-billing-invoices"] })
    },
  })
  const refundMutation = useMutation({
    mutationFn: () => refundPlatformInvoice(token as string, query.data!.tenantId, invoiceId, {
      amountCents: Number(refundAmount),
      reason: refundReason,
    }),
    retry: 0,
    onSuccess: async () => {
      setRefundAmount("")
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["platform-billing-invoice", invoiceId] }),
        queryClient.invalidateQueries({ queryKey: ["platform-billing-invoice-refunds", invoiceId] }),
        queryClient.invalidateQueries({ queryKey: ["platform-billing-invoices"] }),
      ])
    },
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: ["platform-billing-invoice-refunds", invoiceId] })
    },
  })

  if (!canRead) return <UnavailableState title="Billing access is restricted" description="Your platform session does not include the super-admin read permission." />
  if (!token) return <UnavailableState title="Platform authentication is required" description="Sign in with an authorized platform operator session to view invoice details." />
  if (query.isPending) return <div className="h-56 animate-pulse rounded-3xl bg-[var(--muted)]" />
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) return <EmptyState title="Invoice not found" description="The platform API did not return this invoice record." />
    return <UnavailableState title="Unable to load invoice" description="The platform invoice API could not be reached or rejected this request." />
  }

  const invoice = query.data
  if (!invoice) return <EmptyState title="Invoice not found" description="The platform API returned no invoice record." />
  const reservedRefundAmount = (refundsQuery.data ?? [])
    .filter((refund) => ["PENDING", "UNKNOWN", "SUCCEEDED"].includes(refund.status))
    .reduce((total, refund) => total + refund.amountCents, 0)
  const remainingRefundable = Math.max(0, invoice.amountCents - reservedRefundAmount)

  return (
    <>
      <PageHeader eyebrow="Platform console / invoice detail" title={invoice.invoiceNumber} description="Invoice fields returned by the platform billing read contract." actions={<StatusBadge tone={statusTone(invoice.status)}>{invoice.status}</StatusBadge>} />
      <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-6">
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[['Invoice ID', invoice.id], ['Tenant', `${invoice.tenant.name} (${invoice.tenantId})`], ['Amount', `${invoice.currency} ${invoice.amountCents.toLocaleString('en-US')}`], ['Refunded amount', `${invoice.currency} ${invoice.refundedAmountCents.toLocaleString('en-US')}`], ['Subscription ID', invoice.subscriptionId ?? 'Not associated'], ['Due', formatDate(invoice.dueAt)], ['Paid', formatDate(invoice.paidAt)], ['Created', formatDate(invoice.createdAt)]].map(([label, value]) => <div key={label}><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">{label}</dt><dd className="mt-2 break-all text-sm text-[var(--foreground)]">{value}</dd></div>)}
        </dl>
        {refundsQuery.isError ? <p role="alert" className="mt-5 text-sm text-[var(--danger)]">Refund history could not be loaded.</p> : null}
        {refundsQuery.data?.length ? <div className="mt-6"><h2 className="text-sm font-semibold text-[var(--foreground)]">Refund requests</h2><div className="mt-2 space-y-2">{refundsQuery.data.map((refund) => <div key={refund.id} className="flex flex-wrap justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3 text-xs"><span>{refund.amountCents.toLocaleString("en-US")} {refund.currency} · {refund.reason}</span><span>{refund.status}{refund.providerStatus ? ` · ${refund.providerStatus}` : ""}</span></div>)}</div></div> : null}
        {canManageBilling && invoice.status === "PENDING" && !invoice.paidAt ? <button type="button" disabled={cancelMutation.isPending} onClick={() => { if (window.confirm(`Cancel pending invoice ${invoice.invoiceNumber}? This is allowed only if no provider payment is active.`)) cancelMutation.mutate() }} className="mt-6 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] disabled:opacity-50">{cancelMutation.isPending ? "Cancelling..." : "Cancel pending invoice"}</button> : null}
        {canManageBilling && refundsQuery.isSuccess && ["PAID", "PARTIALLY_REFUNDED"].includes(invoice.status) && remainingRefundable > 0 ? (
          <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-4">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Provider refund</h2>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">Remaining amount: {remainingRefundable.toLocaleString("en-US")} cents. Status updates after Xendit confirmation.</p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="text-xs text-[var(--muted-foreground)]">Amount in cents<input type="number" min={1} max={remainingRefundable} step={1} value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} className="mt-1 block w-44 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--foreground)]" /></label>
              <label className="text-xs text-[var(--muted-foreground)]">Reason<select value={refundReason} onChange={(event) => setRefundReason(event.target.value)} className="mt-1 block rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--foreground)]"><option value="REQUESTED_BY_CUSTOMER">Requested by customer</option><option value="DUPLICATE">Duplicate</option><option value="FRAUDULENT">Fraudulent</option></select></label>
              <button type="button" disabled={!Number.isSafeInteger(Number(refundAmount)) || Number(refundAmount) <= 0 || Number(refundAmount) > remainingRefundable || refundMutation.isPending} onClick={() => { if (window.confirm(`Issue a provider refund for ${Number(refundAmount).toLocaleString("en-US")} cents to tenant ${invoice.tenant.name}?`)) refundMutation.mutate() }} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] disabled:opacity-50">{refundMutation.isPending ? "Submitting..." : "Request refund"}</button>
            </div>
            {refundMutation.isError ? <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{refundMutation.error instanceof ApiError ? refundMutation.error.message : "The refund request failed or its provider outcome is unknown. Verify refund status before retrying."}</p> : null}
          </div>
        ) : null}
        {cancelMutation.isError ? <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{cancelMutation.error instanceof ApiError ? cancelMutation.error.message : "Invoice cancellation failed."}</p> : null}
        <div className="mt-8 flex flex-wrap gap-3">
          {invoice.subscriptionId ? <Link href={`/platform/subscriptions/${encodeURIComponent(invoice.subscriptionId)}`} className="inline-flex rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)]">Open subscription</Link> : null}
          <Link href="/platform/billing" className="inline-flex rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)]">Back to billing</Link>
        </div>
      </section>
    </>
  )
}