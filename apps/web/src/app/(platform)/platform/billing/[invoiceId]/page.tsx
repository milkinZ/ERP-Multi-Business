"use client"

import React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"

import { ApiError } from "@/lib/api/client"
import { EmptyState, PageHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { hasPermission } from "@/lib/permissions"
import { getPlatformInvoice } from "@/features/platform/api/queries"
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
  const query = useQuery({
    queryKey: ["platform-billing-invoice", invoiceId],
    queryFn: () => getPlatformInvoice(token as string, invoiceId),
    enabled: Boolean(token && canRead && invoiceId),
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

  return (
    <>
      <PageHeader eyebrow="Platform console / invoice detail" title={invoice.invoiceNumber} description="Invoice fields returned by the platform billing read contract." actions={<StatusBadge tone={statusTone(invoice.status)}>{invoice.status}</StatusBadge>} />
      <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-6">
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[['Invoice ID', invoice.id], ['Tenant', `${invoice.tenant.name} (${invoice.tenantId})`], ['Amount', `${invoice.currency} ${invoice.amountCents.toLocaleString('en-US')}`], ['Subscription ID', invoice.subscriptionId ?? 'Not associated'], ['Due', formatDate(invoice.dueAt)], ['Paid', formatDate(invoice.paidAt)], ['Created', formatDate(invoice.createdAt)]].map(([label, value]) => <div key={label}><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">{label}</dt><dd className="mt-2 break-all text-sm text-[var(--foreground)]">{value}</dd></div>)}
        </dl>
        <div className="mt-8 flex flex-wrap gap-3">
          {invoice.subscriptionId ? <Link href={`/platform/subscriptions/${encodeURIComponent(invoice.subscriptionId)}`} className="inline-flex rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)]">Open subscription</Link> : null}
          <Link href="/platform/billing" className="inline-flex rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)]">Back to billing</Link>
        </div>
      </section>
    </>
  )
}