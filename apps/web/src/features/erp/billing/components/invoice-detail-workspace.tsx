"use client"

import React from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"

import { PageHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth.store"
import { billingKeys, getInvoice } from "@/features/erp/billing/api/queries"

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-"
}

function statusTone(status: string) {
  if (status === "PAID") return "success" as const
  if (status === "FAILED") return "danger" as const
  if (status === "PENDING") return "warning" as const
  return "neutral" as const
}

export function InvoiceDetailWorkspace({ invoiceId }: { invoiceId: string }) {
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const tenantId = session?.tenantId
  const canRead = hasPermission(session, "invoice.read")
  const query = useQuery({
    queryKey: tenantId ? billingKeys.invoice(tenantId, invoiceId) : ["billing", "unauthenticated", invoiceId],
    queryFn: () => getInvoice(token as string, invoiceId),
    enabled: Boolean(token && tenantId && canRead && invoiceId),
    staleTime: 30_000,
  })

  if (!canRead) return <UnavailableState title="Invoice access is restricted" description="Your current tenant session does not include the invoice.read permission." />
  if (query.isPending) return <div className="h-72 animate-pulse rounded-[24px] bg-[var(--muted)]" />
  if (query.isError) {
    const message = query.error instanceof ApiError && query.error.status === 404 ? "This invoice was not found in the active tenant scope." : "The invoice API could not be reached. No invoice details are shown."
    return <UnavailableState title="Unable to load invoice" description={message} />
  }

  const invoice = query.data
  return (
    <>
      <PageHeader eyebrow="Tenant application / billing" title={invoice.invoiceNumber} description="Invoice details returned by the tenant-scoped Billing API." actions={<StatusBadge tone={statusTone(invoice.status)}>{invoice.status}</StatusBadge>} />
      <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-6">
        <dl className="grid gap-5 sm:grid-cols-2">
          <div><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Invoice ID</dt><dd className="mt-2 break-all text-sm text-[var(--foreground)]">{invoice.id}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Amount</dt><dd className="mt-2 text-sm font-semibold text-[var(--foreground)]">{invoice.currency} {invoice.amountCents.toLocaleString("en-US")}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Due</dt><dd className="mt-2 text-sm text-[var(--foreground)]">{formatDate(invoice.dueAt)}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Paid</dt><dd className="mt-2 text-sm text-[var(--foreground)]">{formatDate(invoice.paidAt)}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Created</dt><dd className="mt-2 text-sm text-[var(--foreground)]">{formatDate(invoice.createdAt)}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Subscription</dt><dd className="mt-2 break-all text-sm text-[var(--foreground)]">{invoice.subscriptionId ?? "Not associated"}</dd></div>
        </dl>
        <Link href="/app/billing" className="mt-8 inline-flex rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)]">Back to billing</Link>
      </section>
    </>
  )
}
