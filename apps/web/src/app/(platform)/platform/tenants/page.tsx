"use client"

import React from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"

import { PageHeader, SectionHeader, StatusBadge } from "@/components/data-display/states"
import { getPlatformTenants, type PlatformTenant } from "@/features/platform/api/queries"
import { useAuthStore } from "@/stores/auth.store"

function tenantLifecycleLabel(tenant: PlatformTenant) {
  return tenant.deletedAt ? "Deactivated" : "Active"
}

export default function TenantsPage() {
  const token = useAuthStore((state) => state.accessToken)
  const query = useQuery({
    queryKey: ["platform-tenants"],
    queryFn: () => getPlatformTenants(token as string),
    enabled: Boolean(token),
  })

  const tenants = query.data?.data ?? []

  return (
    <>
      <PageHeader
        eyebrow="Platform console / administration"
        title="Tenants"
        description="Platform-level tenant registry using the verified super-admin API contract and tenant-scoped lifecycle semantics."
        actions={<StatusBadge tone="info">Platform scope</StatusBadge>}
      />

      {!token ? (
        <div className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-[var(--muted-foreground)]">Platform authentication is required to view tenant records.</div>
      ) : query.isPending ? (
        <div className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-8">
          <div className="h-12 animate-pulse rounded-xl bg-[var(--muted)]" />
        </div>
      ) : query.isError ? (
        <div className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-[var(--muted-foreground)]">The platform API rejected this request or is unavailable.</div>
      ) : !tenants.length ? (
        <div className="rounded-[24px] border border-dashed border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-[var(--muted-foreground)]">The API returned an empty tenant collection.</div>
      ) : (
        <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.03)]">
          <SectionHeader eyebrow="Directory" title="Tenant registry" />
          <div className="mt-4 space-y-3">
            {tenants.map((tenant) => (
              <article key={tenant.id} className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel-alt)] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Link href={`/platform/tenants/${tenant.id}`} className="font-medium text-[var(--foreground)] hover:text-[var(--primary)]">
                    {tenant.name}
                  </Link>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    {tenant.businessType ?? "Business type unavailable"} · {tenant.contactEmail ?? "No contact email"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge tone={tenant.deletedAt ? "neutral" : "success"}>{tenantLifecycleLabel(tenant)}</StatusBadge>
                  <span className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">{tenant.id}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
