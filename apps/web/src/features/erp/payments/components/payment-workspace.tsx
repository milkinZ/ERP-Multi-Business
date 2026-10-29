"use client"

import React from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"

import { EmptyState, SectionHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth.store"
import { getPayments, paymentKeys, type PaymentStatus } from "@/features/erp/payments/api/queries"

function formatAmount(value: number, currencyCode?: string | null) {
  return currencyCode
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currencyCode,
        maximumFractionDigits: 0,
      }).format(value)
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)
}

function paymentTone(status: PaymentStatus) {
  if (status === "PAID") return "success" as const
  if (status === "FAILED") return "danger" as const
  if (status === "PENDING") return "warning" as const
  return "neutral" as const
}

export function PaymentWorkspace() {
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const tenantId = session?.tenantId
  const canRead = hasPermission(session, "payment.read")

  const query = useQuery({
    queryKey: tenantId ? paymentKeys.all(tenantId) : ["payments", "unauthenticated"],
    queryFn: () => getPayments(token as string),
    enabled: Boolean(token && tenantId && canRead),
    staleTime: 30_000,
  })

  if (!canRead) {
    return (
      <UnavailableState
        title="Payment access is restricted"
        description="Your current tenant session does not include the payment.read permission."
      />
    )
  }

  if (query.isPending) {
    return (
      <div className="space-y-3">
        <div className="h-20 animate-pulse rounded-[24px] bg-[var(--muted)]" />
        <div className="h-64 animate-pulse rounded-[24px] bg-[var(--muted)]" />
      </div>
    )
  }

  if (query.isError) {
    const message =
      query.error instanceof ApiError && query.error.status === 403
        ? "Your session is not authorized to view payment records."
        : "The Payments API could not be reached. No payment records are shown."

    return <UnavailableState title="Unable to load payments" description={message} />
  }

  const payments = query.data ?? []
  const paidCount = payments.filter((payment) => payment.status === "PAID").length
  const pendingCount = payments.filter((payment) => payment.status === "PENDING").length

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Payments returned</p>
          <p className="mt-3 text-2xl font-semibold text-[var(--foreground)]">{payments.length}</p>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">Tenant-scoped API result</p>
        </div>
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Paid</p>
          <p className="mt-3 text-2xl font-semibold text-[var(--foreground)]">{paidCount}</p>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">Confirmed successful payments</p>
        </div>
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Pending</p>
          <p className="mt-3 text-2xl font-semibold text-[var(--foreground)]">{pendingCount}</p>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">Current backend status</p>
        </div>
      </div>

      {!payments.length ? (
        <EmptyState title="No payments yet" description="This tenant has no payment records exposed by the current backend contract." />
      ) : (
        <section className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--panel)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--muted)] text-[var(--muted-foreground)]">
                <tr>
                  {['Payment', 'Order', 'Method', 'Amount', 'Status', 'Paid at'].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em]">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-t border-[var(--border)] transition-colors hover:bg-[var(--muted)]/50">
                    <td className="px-4 py-4">
                      <Link href={`/app/payments/${payment.id}`} className="font-semibold text-[var(--foreground)] hover:text-[var(--primary)]">
                        {payment.id}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-[var(--muted-foreground)]">
                      {payment.SalesOrder?.orderNumber ?? payment.orderId}
                    </td>
                    <td className="px-4 py-4 font-medium text-[var(--foreground)]">{payment.method}</td>
                    <td className="px-4 py-4 font-medium text-[var(--foreground)]">{formatAmount(payment.amount, payment.SalesOrder?.currencyCode)}</td>
                    <td className="px-4 py-4">
                      <StatusBadge tone={paymentTone(payment.status)}>{payment.status}</StatusBadge>
                    </td>
                    <td className="px-4 py-4 text-[var(--muted-foreground)]">
                      {payment.paidAt ? new Date(payment.paidAt).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5">
        <SectionHeader eyebrow="Contract note" title="Supported payment capability" />
        <p className="text-sm text-[var(--muted-foreground)]">
          This module follows the backend contract: payment creation is order-driven via the payment endpoint, and payment reads are tenant-scoped. Refunds are not exposed by the current backend and remain intentionally unavailable in the UI.
        </p>
      </section>
    </div>
  )
}
