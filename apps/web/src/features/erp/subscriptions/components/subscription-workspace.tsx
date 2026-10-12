"use client"

import React from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"

import { EmptyState, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth.store"
import { billingKeys, getCurrentSubscription } from "@/features/erp/billing/api/queries"

function statusTone(status: string) {
  if (status === "ACTIVE") return "success" as const
  if (status === "PAST_DUE" || status === "SUSPENDED") return "warning" as const
  if (status === "CANCELLED" || status === "EXPIRED") return "danger" as const
  return "neutral" as const
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-"
}

export function SubscriptionWorkspace() {
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const tenantId = session?.tenantId
  const canRead = hasPermission(session, "subscription.read")

  const query = useQuery({
    queryKey: tenantId ? billingKeys.subscription(tenantId) : ["subscriptions", "unauthenticated", "current"],
    queryFn: () => getCurrentSubscription(token as string),
    enabled: Boolean(token && tenantId && canRead),
    staleTime: 60_000,
  })

  if (!canRead) {
    return <UnavailableState title="Subscription access is restricted" description="Your current tenant session does not include the subscription.read permission." />
  }

  if (!token || !tenantId) {
    return <UnavailableState title="Subscription is unavailable" description="Sign in to load the subscription for the authenticated tenant." />
  }

  if (query.isPending) {
    return <div className="h-72 animate-pulse rounded-[24px] bg-[var(--muted)]" />
  }

  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return <EmptyState title="No subscription found" description="The backend did not return a current subscription for this tenant." />
    }

    const description = query.error instanceof ApiError && query.error.status === 403
      ? "Your current session is not authorized to view subscription information."
      : "The Subscription API could not be reached. No subscription state is shown."
    return <UnavailableState title="Unable to load subscription" description={description} />
  }

  const subscription = query.data

  return (
    <div className="space-y-6">
      <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--primary)]">Current subscription</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{subscription.planType}</h2>
            <p className="mt-2 break-all text-xs text-[var(--muted-foreground)]">{subscription.id}</p>
          </div>
          <StatusBadge tone={statusTone(subscription.status)}>{subscription.status}</StatusBadge>
        </div>
        <dl className="mt-8 grid gap-5 border-t border-[var(--border)] pt-6 sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Plan type</dt><dd className="mt-2 text-sm text-[var(--foreground)]">{subscription.planType}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Price cents</dt><dd className="mt-2 text-sm text-[var(--foreground)]">{subscription.priceCents.toLocaleString("en-US")}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Started</dt><dd className="mt-2 text-sm text-[var(--foreground)]">{formatDate(subscription.startedAt)}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Ended</dt><dd className="mt-2 text-sm text-[var(--foreground)]">{formatDate(subscription.endedAt)}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Plan ID</dt><dd className="mt-2 break-all text-sm text-[var(--foreground)]">{subscription.planId}</dd></div>
        </dl>
      </section>

      <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--primary)]">Billing relationship</p>
        <h2 className="mt-2 text-xl font-semibold text-[var(--foreground)]">Invoices and billing actions</h2>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">Invoice records and supported billing actions remain in the Billing module. No unsupported plan-management controls are shown here.</p>
        <Link href="/app/billing" className="mt-4 inline-flex rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)]">Open billing</Link>
      </section>
    </div>
  )
}