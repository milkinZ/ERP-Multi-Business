"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { ApiError } from "@/lib/api/client"
import { EmptyState, PageHeader, SectionHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { hasPermission } from "@/lib/permissions"
import { changePlatformSubscriptionPlan, getPlatformPlans, getPlatformSubscription } from "@/features/platform/api/queries"
import { useAuthStore } from "@/stores/auth.store"

function statusTone(status: string) {
  if (status === "ACTIVE") return "success" as const
  if (status === "PAST_DUE" || status === "SUSPENDED" || status === "TRIAL") return "warning" as const
  if (status === "CANCELLED" || status === "EXPIRED") return "danger" as const
  return "neutral" as const
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-"
}

export default function SubscriptionDetailPage() {
  const { subscriptionId } = useParams<{ subscriptionId: string }>()
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const queryClient = useQueryClient()
  const canRead = hasPermission(session, "super-admin.read")
  const canManage = hasPermission(session, "super-admin.manage.subscriptions")
  const [selectedPlanId, setSelectedPlanId] = useState("")
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const subscriptionQuery = useQuery({
    queryKey: ["platform-subscription", subscriptionId],
    queryFn: () => getPlatformSubscription(token as string, subscriptionId),
    enabled: Boolean(token && canRead && subscriptionId),
  })
  const plansQuery = useQuery({
    queryKey: ["platform-plans"],
    queryFn: () => getPlatformPlans(token as string),
    enabled: Boolean(token && canManage),
  })

  useEffect(() => {
    if (subscriptionQuery.data) setSelectedPlanId(subscriptionQuery.data.planId)
  }, [subscriptionQuery.data])

  const planMutation = useMutation({
    mutationFn: () => {
      if (!token || !subscriptionQuery.data) throw new Error("Authentication required")
      return changePlatformSubscriptionPlan(token, subscriptionQuery.data.tenantId, selectedPlanId)
    },
    retry: 0,
    onSuccess: async () => {
      setMutationError(null)
      setSuccessMessage("The plan change was accepted by the platform API.")
      await queryClient.invalidateQueries({ queryKey: ["platform-subscription", subscriptionId] })
      await queryClient.invalidateQueries({ queryKey: ["platform-subscriptions"] })
    },
    onError: (cause) => {
      setSuccessMessage(null)
      setMutationError(cause instanceof ApiError ? cause.message : "The platform API rejected the plan change.")
    },
  })

  if (!canRead) return <UnavailableState title="Subscription access is restricted" description="Your platform session does not include the super-admin read permission." />
  if (!token) return <UnavailableState title="Platform authentication is required" description="Sign in with an authorized platform operator session to view subscription details." />
  if (subscriptionQuery.isPending) return <div className="h-56 animate-pulse rounded-3xl bg-[var(--muted)]" />
  if (subscriptionQuery.isError) {
    if (subscriptionQuery.error instanceof ApiError && subscriptionQuery.error.status === 404) return <EmptyState title="Subscription not found" description="The platform API did not return this subscription record." />
    return <UnavailableState title="Unable to load subscription" description="The platform subscription API could not be reached or rejected this request." />
  }

  const subscription = subscriptionQuery.data
  if (!subscription) return <EmptyState title="Subscription not found" description="The platform API returned no subscription record." />

  return (
    <>
      <PageHeader eyebrow="Platform console / subscription detail" title={subscription.tenant.name} description="Verified subscription fields and the supported platform plan-change operation." actions={<StatusBadge tone={statusTone(subscription.status)}>{subscription.status}</StatusBadge>} />
      {mutationError ? <p role="alert" className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--muted-foreground)]">{mutationError}</p> : null}
      {successMessage ? <p role="status" className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--foreground)]">{successMessage}</p> : null}
      <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5">
        <SectionHeader eyebrow="Record" title="Subscription details" />
        <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[['Subscription ID', subscription.id], ['Tenant ID', subscription.tenantId], ['Plan ID', subscription.planId], ['Plan type', subscription.planType], ['Price cents', subscription.priceCents.toLocaleString('en-US')], ['Started', formatDate(subscription.startedAt)], ['Ended', formatDate(subscription.endedAt)]].map(([label, value]) => <div key={label}><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">{label}</dt><dd className="mt-2 break-all text-sm text-[var(--foreground)]">{value}</dd></div>)}
        </dl>
      </section>
      {canManage ? <section className="mt-6 rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5"><SectionHeader eyebrow="Supported mutation" title="Change plan" /><div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"><label className="flex-1 text-sm text-[var(--muted-foreground)]">Plan<select value={selectedPlanId} onChange={(event) => setSelectedPlanId(event.target.value)} disabled={plansQuery.isPending || planMutation.isPending} className="mt-2 block w-full rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] px-3 py-2 text-sm text-[var(--foreground)]"><option value="">Select a plan</option>{plansQuery.data?.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} ({plan.type}) · {plan.priceCents.toLocaleString('en-US')} cents</option>)}</select></label><button type="button" disabled={!selectedPlanId || selectedPlanId === subscription.planId || planMutation.isPending} onClick={() => planMutation.mutate()} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--panel-alt)] disabled:opacity-50">{planMutation.isPending ? "Submitting..." : "Change plan"}</button></div>{plansQuery.isError ? <p className="mt-3 text-sm text-[var(--muted-foreground)]">The plan catalog could not be loaded.</p> : null}</section> : null}
      <Link href="/platform/subscriptions" className="mt-6 inline-flex text-sm font-semibold text-[var(--primary)] hover:underline">Back to subscriptions</Link>
    </>
  )
}