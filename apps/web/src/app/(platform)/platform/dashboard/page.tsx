"use client"

import React from "react"
import { useQuery } from "@tanstack/react-query"

import { EmptyState, MetricCard, PageHeader, SectionHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { hasPermission } from "@/lib/permissions"
import { getHealth, getPlatformTenants, platformObservabilityKeys, type PlatformTenant } from "@/features/platform/api/queries"
import { useAuthStore } from "@/stores/auth.store"

function lifecycleLabel(tenant: PlatformTenant) {
  return tenant.deletedAt ? "Deactivated" : "Active"
}

export default function PlatformDashboardPage() {
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const canRead = hasPermission(session, "super-admin.read")

  const healthQuery = useQuery({ queryKey: platformObservabilityKeys.readiness(), queryFn: getHealth, enabled: canRead })
  const tenantsQuery = useQuery({
    queryKey: ["platform-tenants-dashboard"],
    queryFn: () => getPlatformTenants(token as string),
    enabled: Boolean(token && canRead),
  })

  if (!canRead) {
    return <UnavailableState title="Dashboard access is restricted" description="Your platform session does not include the super-admin read permission." />
  }

  if (!token) {
    return <UnavailableState title="Platform authentication is required" description="Sign in with an authorized platform operator session to view dashboard data." />
  }

  const totalTenants = tenantsQuery.data?.total
  const recentTenants = tenantsQuery.data?.data.slice(0, 4) ?? []
  const readiness = healthQuery.data?.data
  const isReady = Boolean(readiness?.database?.ok && readiness?.redis?.ok && readiness?.bullmq?.ok)
  const readinessLabel = healthQuery.isPending ? "Checking" : healthQuery.isError ? "Unavailable" : isReady ? "Ready" : "Not ready"

  return (
    <>
      <PageHeader
        eyebrow="Platform console"
        title="Control room"
        description="Backend-authoritative overview of platform tenant records and service readiness."
        actions={<StatusBadge tone={healthQuery.isError ? "danger" : isReady ? "success" : "info"}>{readinessLabel}</StatusBadge>}
      />

      <section className="grid gap-4 md:grid-cols-2">
        <MetricCard title="Tenants" value={tenantsQuery.isPending ? "Loading" : tenantsQuery.isError ? "Unavailable" : String(totalTenants)} detail="Platform API total; not calculated in the browser" tone={tenantsQuery.isError ? "danger" : "info"} />
        <MetricCard title="Readiness" value={readinessLabel} detail="Database, Redis, and BullMQ readiness response" tone={healthQuery.isError ? "danger" : isReady ? "success" : "warning"} />
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.03)]">
          <SectionHeader eyebrow="Tenants" title="Tenant overview" />
          <div className="mt-4 space-y-3">
            {tenantsQuery.isPending ? <div className="h-20 animate-pulse rounded-2xl bg-[var(--muted)]" /> : null}
            {tenantsQuery.isError ? <UnavailableState title="Tenant overview unavailable" description={tenantsQuery.error instanceof ApiError && tenantsQuery.error.status === 403 ? "This platform session is not authorized to read tenant records." : "The platform tenant API could not be reached."} /> : null}
            {recentTenants.map((tenant) => (
              <div key={tenant.id} className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--panel-alt)] px-4 py-3">
                <div>
                  <p className="font-medium text-[var(--foreground)]">{tenant.name}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">{tenant.businessType ?? "Business type unavailable"}</p>
                </div>
                <StatusBadge tone={tenant.deletedAt ? "neutral" : "info"}>{lifecycleLabel(tenant)}</StatusBadge>
              </div>
            ))}
            {!recentTenants.length && !tenantsQuery.isPending && !tenantsQuery.isError ? <EmptyState title="No tenants found" description="The platform API returned an empty tenant collection." /> : null}
          </div>
        </section>

        <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.03)]">
          <SectionHeader eyebrow="System health" title="Readiness" />
          <div className="mt-4 space-y-3">
            {healthQuery.isPending ? <div className="h-20 animate-pulse rounded-2xl bg-[var(--muted)]" /> : null}
            {healthQuery.isError ? <UnavailableState title="Readiness unavailable" description="The platform health endpoint could not be reached." /> : null}
            {readiness ? <>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-alt)] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Database</p>
              <div className="mt-2 flex items-center justify-between">
                <strong className="text-sm text-[var(--foreground)]">{readiness.database.ok ? "Available" : "Unavailable"}</strong>
                <StatusBadge tone={readiness.database.ok ? "success" : "danger"}>{readiness.database.ok ? "Ready" : "Down"}</StatusBadge>
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-alt)] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Redis</p>
              <div className="mt-2 flex items-center justify-between">
                <strong className="text-sm text-[var(--foreground)]">{readiness.redis.ok ? "Available" : "Unavailable"}</strong>
                <StatusBadge tone={readiness.redis.ok ? "success" : "danger"}>{readiness.redis.ok ? "Ready" : "Down"}</StatusBadge>
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-alt)] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">BullMQ</p>
              <div className="mt-2 flex items-center justify-between">
                <strong className="text-sm text-[var(--foreground)]">{readiness.bullmq.status ?? (readiness.bullmq.ok ? "Available" : "Unavailable")}</strong>
                <StatusBadge tone={readiness.bullmq.ok ? "success" : "danger"}>{readiness.bullmq.ok ? "Ready" : "Down"}</StatusBadge>
              </div>
            </div>
            </> : null}
          </div>
        </section>
      </div>
    </>
  )
}
