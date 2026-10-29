"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { EmptyState, SectionHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError, saveBlob } from "@/lib/api/client"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth.store"
import {
  billingKeys,
  cancelInvoice,
  downloadTenantInvoices,
  executeBilling,
  getCurrentSubscription,
  getInvoices,
  renewSubscription,
  type Invoice,
} from "@/features/erp/billing/api/queries"

const PAGE_SIZE = 10

function invoiceTone(status: string) {
  if (status === "PAID") return "success" as const
  if (status === "FAILED") return "danger" as const
  if (status === "PENDING") return "warning" as const
  return "neutral" as const
}

function formatAmount(invoice: Invoice) {
  return `${invoice.currency} ${invoice.amountCents.toLocaleString("en-US")}`
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-"
}

export function BillingWorkspace() {
  const [page, setPage] = useState(0)
  const [exportFilters, setExportFilters] = useState({ from: "", to: "", status: "" })
  const queryClient = useQueryClient()
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const tenantId = session?.tenantId
  const canReadInvoices = hasPermission(session, "invoice.read")
  const canExecute = hasPermission(session, "billing.execute")
  const canReadSubscription = hasPermission(session, "subscription.read")

  const invoiceQuery = useQuery({
    queryKey: tenantId ? billingKeys.invoices(tenantId, page * PAGE_SIZE, PAGE_SIZE) : ["billing", "unauthenticated", "invoices"],
    queryFn: () => getInvoices(token as string, page * PAGE_SIZE, PAGE_SIZE),
    enabled: Boolean(token && tenantId && canReadInvoices),
    staleTime: 30_000,
  })

  const subscriptionQuery = useQuery({
    queryKey: tenantId ? billingKeys.subscription(tenantId) : ["billing", "unauthenticated", "subscription"],
    queryFn: () => getCurrentSubscription(token as string),
    enabled: Boolean(token && tenantId && canExecute && canReadSubscription),
    staleTime: 60_000,
  })

  const billingMutation = useMutation({
    mutationFn: ({ action, subscriptionId }: { action: "execute" | "renew"; subscriptionId: string }) =>
      action === "execute" ? executeBilling(token as string, subscriptionId) : renewSubscription(token as string, subscriptionId),
    retry: 0,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tenantId ? billingKeys.all(tenantId) : ["billing"] }),
        queryClient.invalidateQueries({ queryKey: tenantId ? ["subscriptions", tenantId] : ["subscriptions"] }),
      ])
    },
  })

  const exportMutation = useMutation({
    mutationFn: () => downloadTenantInvoices(token as string, exportFilters),
    retry: 0,
    onSuccess: (blob) => saveBlob(blob, "invoices.csv"),
  })

  const cancelMutation = useMutation({
    mutationFn: (invoiceId: string) => cancelInvoice(token as string, invoiceId),
    retry: 0,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tenantId ? billingKeys.all(tenantId) : ["billing"] })
    },
  })

  if (!canReadInvoices) {
    return <UnavailableState title="Billing access is restricted" description="Your current tenant session does not include the invoice.read permission." />
  }

  if (!token || !tenantId) {
    return <UnavailableState title="Billing is unavailable" description="Sign in to load tenant-scoped invoices from the backend." />
  }

  if (invoiceQuery.isPending) {
    return <div className="space-y-3"><div className="h-20 animate-pulse rounded-[24px] bg-[var(--muted)]" /><div className="h-64 animate-pulse rounded-[24px] bg-[var(--muted)]" /></div>
  }

  if (invoiceQuery.isError) {
    const message = invoiceQuery.error instanceof ApiError && invoiceQuery.error.status === 403 ? "Your session is not authorized to view invoices." : "The Billing API could not be reached. No invoice records are shown."
    return <UnavailableState title="Unable to load billing" description={message} />
  }

  const invoicePage = invoiceQuery.data
  const invoices = invoicePage?.data ?? []
  const subscription = subscriptionQuery.data
  const mutationError = billingMutation.error

  function runBilling(action: "execute" | "renew") {
    if (!subscription || !window.confirm(action === "execute" ? "Create a billing invoice for the current subscription?" : "Renew the current subscription and create its next billing invoice?")) return
    billingMutation.mutate({ action, subscriptionId: subscription.id })
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5">
        <SectionHeader eyebrow="Tenant billing" title="Backend-authoritative billing" />
        <p className="text-sm text-[var(--muted-foreground)]">Invoices are displayed exactly as returned by the tenant-scoped Billing API. Amounts are shown in the backend-provided currency and amountCents field.</p>
        {canExecute && canReadSubscription && subscriptionQuery.isError ? <p className="mt-3 text-sm text-[var(--muted-foreground)]">Current subscription details are unavailable, so billing actions remain disabled.</p> : null}
        {canExecute && subscription ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <StatusBadge tone={subscription.status === "ACTIVE" ? "success" : "warning"}>{subscription.status}</StatusBadge>
            <span className="text-sm text-[var(--muted-foreground)]">{subscription.planType}</span>
            <button type="button" disabled={billingMutation.isPending} onClick={() => runBilling("execute")} className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Create invoice</button>
            <button type="button" disabled={billingMutation.isPending} onClick={() => runBilling("renew")} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] disabled:opacity-50">Renew subscription</button>
          </div>
        ) : null}
        {mutationError ? <p role="alert" className="mt-3 text-sm text-[var(--danger)]">The billing request failed or its result is unknown. Check the invoice list before retrying.</p> : null}
      </section>

      <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
        <label className="text-xs font-semibold text-[var(--muted-foreground)]">From<input type="date" value={exportFilters.from} onChange={(event) => setExportFilters((current) => ({ ...current, from: event.target.value }))} className="mt-1 block rounded-lg border border-[var(--border)] bg-[var(--panel-alt)] px-3 py-2 text-sm text-[var(--foreground)]" /></label>
        <label className="text-xs font-semibold text-[var(--muted-foreground)]">To<input type="date" value={exportFilters.to} onChange={(event) => setExportFilters((current) => ({ ...current, to: event.target.value }))} className="mt-1 block rounded-lg border border-[var(--border)] bg-[var(--panel-alt)] px-3 py-2 text-sm text-[var(--foreground)]" /></label>
        <label className="text-xs font-semibold text-[var(--muted-foreground)]">Status<select value={exportFilters.status} onChange={(event) => setExportFilters((current) => ({ ...current, status: event.target.value }))} className="mt-1 block rounded-lg border border-[var(--border)] bg-[var(--panel-alt)] px-3 py-2 text-sm text-[var(--foreground)]"><option value="">All statuses</option>{["PENDING", "PAID", "FAILED", "CANCELLED", "REFUNDED"].map((status) => <option key={status}>{status}</option>)}</select></label>
        <button type="button" disabled={exportMutation.isPending} onClick={() => exportMutation.mutate()} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] disabled:opacity-50">{exportMutation.isPending ? "Preparing CSV..." : "Export CSV"}</button>
        {exportMutation.isError ? <p role="alert" className="text-sm text-[var(--danger)]">{exportMutation.error instanceof ApiError ? exportMutation.error.message : "Invoice export failed."}</p> : null}
        {cancelMutation.isError ? <p role="alert" className="text-sm text-[var(--danger)]">{cancelMutation.error instanceof ApiError ? cancelMutation.error.message : "Invoice cancellation failed."}</p> : null}
      </section>

      {!invoices.length ? <EmptyState title="No invoices" description="No invoice records are currently returned for this tenant." /> : (
        <section className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--panel)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--muted)] text-[var(--muted-foreground)]"><tr>{["Invoice", "Amount", "Status", "Due", "Paid", "Created", ...(canExecute ? ["Action"] : [])].map((heading) => <th key={heading} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em]">{heading}</th>)}</tr></thead>
              <tbody>{invoices.map((invoice) => <tr key={invoice.id} className="border-t border-[var(--border)] hover:bg-[var(--muted)]/50">
                <td className="px-4 py-4"><Link href={`/app/billing/${invoice.id}`} className="font-semibold text-[var(--foreground)] hover:text-[var(--primary)]">{invoice.invoiceNumber}</Link><p className="mt-1 text-xs text-[var(--muted-foreground)]">{invoice.id}</p></td>
                <td className="px-4 py-4 font-medium text-[var(--foreground)]">{formatAmount(invoice)}</td>
                <td className="px-4 py-4"><StatusBadge tone={invoiceTone(invoice.status)}>{invoice.status}</StatusBadge></td>
                <td className="px-4 py-4 text-[var(--muted-foreground)]">{formatDate(invoice.dueAt)}</td>
                <td className="px-4 py-4 text-[var(--muted-foreground)]">{formatDate(invoice.paidAt)}</td>
                <td className="px-4 py-4 text-[var(--muted-foreground)]">{formatDate(invoice.createdAt)}</td>
                {canExecute ? <td className="px-4 py-4">{invoice.status === "PENDING" && !invoice.providerPaymentRequestId && !invoice.providerPaymentId ? <button type="button" disabled={cancelMutation.isPending} onClick={() => { if (window.confirm(`Cancel pending invoice ${invoice.invoiceNumber}?`)) cancelMutation.mutate(invoice.id) }} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] disabled:opacity-50">Cancel</button> : <span className="text-xs text-[var(--muted-foreground)]">-</span>}</td> : null}
              </tr>)}</tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
            <span>{invoicePage.skip + 1}-{Math.min(invoicePage.skip + invoicePage.data.length, invoicePage.total)} of {invoicePage.total}</span>
            <div className="flex gap-2"><button type="button" disabled={page === 0} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 disabled:opacity-40">Previous</button><button type="button" disabled={invoicePage.skip + invoicePage.data.length >= invoicePage.total} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 disabled:opacity-40">Next</button></div>
          </div>
        </section>
      )}
    </div>
  )
}
