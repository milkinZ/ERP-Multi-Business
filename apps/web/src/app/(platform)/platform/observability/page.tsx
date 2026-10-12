"use client"

import React from "react"
import { useQuery } from "@tanstack/react-query"

import { EmptyState, PageHeader, SectionHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { hasPermission } from "@/lib/permissions"
import { getHealth, getLiveness, getPlatformQueues, platformObservabilityKeys } from "@/features/platform/api/queries"
import { useAuthStore } from "@/stores/auth.store"

function readinessTone(ok: boolean | undefined, isError = false) {
  if (isError || ok === false) return "danger" as const
  if (ok === true) return "success" as const
  return "neutral" as const
}

function readinessLabel(ok: boolean | undefined, isPending: boolean, isError: boolean) {
  if (isPending) return "Checking"
  if (isError || ok === undefined) return "Unavailable"
  return ok ? "Ready" : "Down"
}

function HealthSignal({ label, ok }: { label: string; ok: boolean }) {
  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--panel-alt)] p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">{label}</p>
      <div className="mt-3 flex items-center justify-between">
        <strong className="text-sm text-[var(--foreground)]">{ok ? "Available" : "Unavailable"}</strong>
        <StatusBadge tone={readinessTone(ok)}>{ok ? "Ready" : "Down"}</StatusBadge>
      </div>
    </article>
  )
}

export default function ObservabilityPage() {
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const canRead = hasPermission(session, "super-admin.read")

  const readinessQuery = useQuery({
    queryKey: platformObservabilityKeys.readiness(),
    queryFn: getHealth,
    enabled: Boolean(token && canRead),
    staleTime: 15_000,
  })
  const livenessQuery = useQuery({
    queryKey: platformObservabilityKeys.liveness(),
    queryFn: getLiveness,
    enabled: Boolean(token && canRead),
    staleTime: 15_000,
  })
  const queuesQuery = useQuery({
    queryKey: platformObservabilityKeys.queues(),
    queryFn: () => getPlatformQueues(token as string),
    enabled: Boolean(token && canRead),
    staleTime: 15_000,
  })

  if (!canRead) return <UnavailableState title="Observability access is restricted" description="Your platform session does not include the super-admin read permission." />
  if (!token) return <UnavailableState title="Platform authentication is required" description="Sign in with an authorized platform operator session to view operational signals." />

  const readiness = readinessQuery.data?.data
  const ready = Boolean(readiness?.database?.ok && readiness?.redis?.ok && readiness?.bullmq?.ok)
  const overallLabel = readinessLabel(ready, readinessQuery.isPending, readinessQuery.isError)

  return (
    <>
      <PageHeader
        eyebrow="Platform console / live signals"
        title="Observability"
        description="Current request-time health, liveness, and bounded queue snapshots from authoritative platform endpoints."
        actions={<StatusBadge tone={readinessTone(ready, readinessQuery.isError)}>{overallLabel}</StatusBadge>}
      />

      <section aria-labelledby="system-health-heading" className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.03)]">
        <SectionHeader title="System health" action={<span className="text-xs text-[var(--muted-foreground)]">Request-time readiness</span>} />
        {readinessQuery.isPending ? <div className="h-24 animate-pulse rounded-2xl bg-[var(--muted)]" /> : readinessQuery.isError ? <UnavailableState title="Readiness unavailable" description={readinessQuery.error instanceof ApiError ? readinessQuery.error.message : "The readiness endpoint could not be reached."} /> : (
          <div className="grid gap-3 md:grid-cols-3">
            <HealthSignal label="Database" ok={Boolean(readiness?.database.ok)} />
            <HealthSignal label="Redis" ok={Boolean(readiness?.redis.ok)} />
            <HealthSignal label="BullMQ" ok={Boolean(readiness?.bullmq.ok)} />
          </div>
        )}
      </section>

      <section aria-labelledby="liveness-heading" className="mt-6 rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.03)]">
        <SectionHeader title="Application liveness" action={<span className="text-xs text-[var(--muted-foreground)]">Process-alive signal</span>} />
        {livenessQuery.isPending ? <div className="h-16 animate-pulse rounded-2xl bg-[var(--muted)]" /> : livenessQuery.isError ? <UnavailableState title="Liveness unavailable" description="The liveness endpoint could not be reached." /> : <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel-alt)] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium text-[var(--foreground)]">{livenessQuery.data?.message}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">Observed {livenessQuery.data?.timestamp}</p></div><StatusBadge tone={livenessQuery.data?.success ? "success" : "danger"}>{livenessQuery.data?.success ? "Alive" : "Unavailable"}</StatusBadge></div>}
      </section>

      <section aria-labelledby="queue-health-heading" className="mt-6 rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.03)]">
        <SectionHeader title="Queue health" action={<span className="text-xs text-[var(--muted-foreground)]">Bounded BullMQ snapshots</span>} />
        {queuesQuery.isPending ? <div className="h-24 animate-pulse rounded-2xl bg-[var(--muted)]" /> : queuesQuery.isError ? <UnavailableState title="Queue snapshots unavailable" description={queuesQuery.error instanceof ApiError && queuesQuery.error.status === 403 ? "This platform session is not authorized to read queue snapshots." : "The queue monitor endpoint could not be reached."} /> : !queuesQuery.data?.data.length ? <EmptyState title="No queue snapshots" description="The queue monitor returned no queue records." /> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-[var(--border)] text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">{["Queue", "Waiting", "Active", "Delayed", "Failed", "Completed"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead><tbody>{queuesQuery.data?.data.map((queue) => <tr key={queue.name} className="border-b border-[var(--border)] last:border-0"><th scope="row" className="px-3 py-3 font-medium text-[var(--foreground)]">{queue.name}</th><td className="px-3 py-3 text-[var(--muted-foreground)]">{queue.waiting}</td><td className="px-3 py-3 text-[var(--muted-foreground)]">{queue.active}</td><td className="px-3 py-3 text-[var(--muted-foreground)]">{queue.delayed}</td><td className="px-3 py-3 text-[var(--muted-foreground)]">{queue.failed}</td><td className="px-3 py-3 text-[var(--muted-foreground)]">{queue.completed}</td></tr>)}</tbody></table></div>}
      </section>
    </>
  )
}