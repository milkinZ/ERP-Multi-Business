"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"

import { EmptyState, SectionHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth.store"
import { billingKeys, getCurrentSubscription, getSubscriptionHistory } from "@/features/erp/billing/api/queries"

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
  const [historySkip, setHistorySkip] = useState(0)
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
  const historyQuery = useQuery({
    queryKey: ["subscription-history", tenantId, query.data?.id, historySkip],
    queryFn: () => {
      if (!token || !query.data?.id) throw new Error("Subscription is unavailable")
      return getSubscriptionHistory(token, query.data.id, historySkip, 50)
    },
    enabled: Boolean(token && tenantId && canRead && query.data?.id),
    staleTime: 30_000,
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

      <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5">
        <SectionHeader eyebrow="Lifecycle history" title="Subscription changes" />
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">A tenant-scoped record of lifecycle and plan events, including timestamp, actor type, and safe event metadata.</p>
        {historyQuery.isPending ? <div className="mt-4 h-24 animate-pulse rounded-2xl bg-[var(--muted)]" /> : historyQuery.isError ? <UnavailableState title="Subscription history unavailable" description="The history API could not be reached. Current subscription state remains available above." /> : !historyQuery.data?.data.length ? <EmptyState title="No history recorded" description="No subscription lifecycle events have been recorded for this subscription." /> : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead><tr className="border-b border-[var(--border)] text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">{["Event", "Actor", "Occurred", "Safe metadata"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead>
                <tbody>{historyQuery.data.data.map((event) => <tr key={event.id} className="border-b border-[var(--border)] last:border-0">
                  <th scope="row" className="px-3 py-3 font-medium text-[var(--foreground)]">{event.eventType}</th>
                  <td className="px-3 py-3 text-[var(--muted-foreground)]">{event.actorType}{event.actorUserId ? ` · ${event.actorUserId}` : ""}</td>
                  <td className="px-3 py-3 text-[var(--muted-foreground)]">{formatDate(event.createdAt)}</td>
                  <td className="max-w-sm px-3 py-3 text-[var(--muted-foreground)]">{Object.entries(event.metadata).map(([key, value]) => `${key}: ${String(value)}`).join(" · ") || "-"}</td>
                </tr>)}</tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm text-[var(--muted-foreground)]">
              <span>{historySkip + 1}-{Math.min(historySkip + historyQuery.data.data.length, historyQuery.data.total)} of {historyQuery.data.total}</span>
              <div className="flex gap-2">
                <button type="button" disabled={historySkip === 0} onClick={() => setHistorySkip((value) => Math.max(0, value - 50))} className="rounded-lg border border-[var(--border)] px-3 py-1.5 disabled:opacity-40">Previous</button>
                <button type="button" disabled={historySkip + historyQuery.data.data.length >= historyQuery.data.total} onClick={() => setHistorySkip((value) => value + 50)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 disabled:opacity-40">Next</button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}