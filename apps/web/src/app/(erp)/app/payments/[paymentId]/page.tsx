"use client"

import React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"

import { PageHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { hasPermission } from "@/lib/permissions"
import { getPayment, paymentKeys, type PaymentStatus } from "@/features/erp/payments/api/queries"
import { useAuthStore } from "@/stores/auth.store"

function formatAmount(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)
}

function paymentTone(status: PaymentStatus) {
  if (status === "PAID") return "success" as const
  if (status === "FAILED") return "danger" as const
  if (status === "PENDING") return "warning" as const
  return "neutral" as const
}

export default function PaymentDetailPage() {
  const params = useParams<{ paymentId: string }>()
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const tenantId = session?.tenantId
  const canRead = hasPermission(session, "payment.read")

  const query = useQuery({
    queryKey: tenantId ? paymentKeys.detail(tenantId, params.paymentId) : ["payments", "unauthenticated", params.paymentId],
    queryFn: () => getPayment(token as string, params.paymentId),
    enabled: Boolean(token && tenantId && canRead && params.paymentId),
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
    return <div className="h-48 animate-pulse rounded-3xl border border-border bg-[var(--panel)]" />
  }

  if (query.isError) {
    const description =
      query.error instanceof ApiError && query.error.status === 404
        ? "This payment record was not found in the current tenant scope."
        : "The payment detail API could not be reached."

    return <UnavailableState title="Unable to load payment" description={description} />
  }

  if (!query.data) {
    return <UnavailableState title="Payment not found" description="The API returned no payment record for this route." />
  }

  const payment = query.data

  return (
    <>
      <PageHeader
        eyebrow="Tenant application / finance"
        title={payment.id}
        description="Payment detail returned by the tenant-scoped backend API."
        actions={<StatusBadge tone={paymentTone(payment.status)}>{payment.status}</StatusBadge>}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Order</p>
          <p className="mt-2 break-all font-medium">{payment.SalesOrder?.orderNumber ?? payment.orderId}</p>
        </div>
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Amount</p>
          <p className="mt-2 text-2xl font-semibold">{formatAmount(payment.amount)}</p>
        </div>
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Method</p>
          <p className="mt-2 font-medium">{payment.method}</p>
        </div>
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Paid at</p>
          <p className="mt-2 font-medium">{payment.paidAt ? new Date(payment.paidAt).toLocaleString() : "—"}</p>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Reference</p>
          <p className="mt-2 break-all font-medium">{payment.referenceNumber ?? "No backend reference returned"}</p>
        </div>
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Tenant</p>
          <p className="mt-2 break-all font-medium">{payment.tenantId}</p>
        </div>
      </section>

      <section className="mt-6 rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Order state</p>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          {payment.SalesOrder ? `Order status: ${payment.SalesOrder.status ?? "Unknown"}` : "Order relationship is not returned by the backend for this payment."}
        </p>
      </section>

      <section className="mt-6 rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--primary)]">Backend contract note</p>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Refunds are not supported by the current payment backend contract. Successful payment state is authoritative and order/payment consistency is driven by the backend transaction.
        </p>
      </section>

      <Link href="/app/payments" className="mt-6 inline-flex text-sm font-semibold text-[var(--primary)] hover:underline">
        Back to payments
      </Link>
    </>
  )
}
