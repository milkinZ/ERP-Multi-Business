"use client"

import React, { useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { PageHeader, SectionHeader, StatusBadge } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import {
  activatePlatformTenant,
  deactivatePlatformTenant,
  getPlatformTenant,
  restorePlatformTenant,
  suspendPlatformTenant,
} from "@/features/platform/api/queries"
import { useAuthStore } from "@/stores/auth.store"

function tenantStateLabel(deletedAt?: string | null) {
  return deletedAt ? "Deactivated" : "Active"
}

export default function TenantDetailPage() {
  const { tenantId } = useParams<{ tenantId: string }>()
  const queryClient = useQueryClient()
  const token = useAuthStore((state) => state.accessToken)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [latestAction, setLatestAction] = useState<{ action: string; status: string } | null>(null)

  const query = useQuery({
    queryKey: ["platform-tenant", tenantId],
    queryFn: () => getPlatformTenant(token as string, tenantId),
    enabled: Boolean(token && tenantId),
  })

  const tenant = query.data
  const canMutate = Boolean(token && tenantId)

  const tenantDetailCards = useMemo(
    () => [
      { label: "Business type", value: tenant?.businessType ?? "Unavailable" },
      { label: "Contact email", value: tenant?.contactEmail ?? "Unavailable" },
      { label: "Contact phone", value: tenant?.contactPhone ?? "Unavailable" },
      { label: "Created", value: tenant ? new Date(tenant.createdAt).toLocaleString() : "-" },
      { label: "Updated", value: tenant ? new Date(tenant.updatedAt).toLocaleString() : "-" },
      { label: "Deleted", value: tenant?.deletedAt ? new Date(tenant.deletedAt).toLocaleString() : "Not deactivated" },
    ],
    [tenant],
  )

  const lifecycleMutation = useMutation({
    mutationFn: async (action: "activate" | "suspend" | "deactivate" | "restore") => {
      if (!token || !tenantId) throw new Error("Authentication required")

      switch (action) {
        case "activate":
          return activatePlatformTenant(token, tenantId)
        case "suspend":
          return suspendPlatformTenant(token, tenantId)
        case "deactivate":
          return deactivatePlatformTenant(token, tenantId)
        case "restore":
          return restorePlatformTenant(token, tenantId)
        default:
          throw new Error("Unsupported lifecycle action")
      }
    },
    retry: 0,
    onSuccess: async (result, action) => {
      setLatestAction({ action, status: result.status })
      setMutationError(null)
      await queryClient.invalidateQueries({ queryKey: ["platform-tenant", tenantId] })
      await queryClient.invalidateQueries({ queryKey: ["platform-tenants"] })
      await queryClient.invalidateQueries({ queryKey: ["platform-tenants-dashboard"] })
    },
    onError: (cause) => {
      const message = cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "Unable to update tenant lifecycle."
      setMutationError(message)
    },
  })

  if (!token) {
    return (
      <div className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-[var(--muted-foreground)]">
        Platform authentication is required to view tenant details.
      </div>
    )
  }

  if (query.isPending) {
    return <div className="h-56 animate-pulse rounded-3xl bg-[var(--muted)]" />
  }

  if (query.isError) {
    return (
      <div className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-[var(--muted-foreground)]">
        This tenant could not be loaded from the platform API.
      </div>
    )
  }

  if (!tenant) {
    return <div className="rounded-[24px] border border-dashed border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-[var(--muted-foreground)]">Tenant not found.</div>
  }

  return (
    <>
      <PageHeader
        eyebrow="Platform console / tenancy"
        title={tenant.name}
        description="Backend-authoritative tenant details and the supported lifecycle actions exposed by the super-admin API."
        actions={<StatusBadge tone={tenant.deletedAt ? "neutral" : "success"}>{tenantStateLabel(tenant.deletedAt)}</StatusBadge>}
      />

      {mutationError ? (
        <p role="alert" className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
          {mutationError}
        </p>
      ) : null}

      {latestAction ? (
        <p className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--foreground)]">
          Latest lifecycle action: <strong>{latestAction.action.toUpperCase()}</strong> → {latestAction.status}
        </p>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tenantDetailCards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">{card.label}</p>
            <p className="mt-2 font-medium text-[var(--foreground)]">{card.value}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.03)]">
        <SectionHeader eyebrow="Lifecycle" title="Platform actions" />
        <div className="mt-4 flex flex-wrap gap-2">
          {!tenant.deletedAt ? (
            <>
              <button type="button" disabled={!canMutate || lifecycleMutation.isPending} onClick={() => lifecycleMutation.mutate("suspend")} className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--foreground)] hover:bg-[var(--panel-alt)] disabled:opacity-50">
                {lifecycleMutation.isPending ? "Submitting..." : "Suspend"}
              </button>
              <button type="button" disabled={!canMutate || lifecycleMutation.isPending} onClick={() => lifecycleMutation.mutate("deactivate")} className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--foreground)] hover:bg-[var(--panel-alt)] disabled:opacity-50">
                Deactivate
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={!canMutate || lifecycleMutation.isPending} onClick={() => lifecycleMutation.mutate("activate")} className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--foreground)] hover:bg-[var(--panel-alt)] disabled:opacity-50">
                Activate
              </button>
              <button type="button" disabled={!canMutate || lifecycleMutation.isPending} onClick={() => lifecycleMutation.mutate("restore")} className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--foreground)] hover:bg-[var(--panel-alt)] disabled:opacity-50">
                Restore
              </button>
            </>
          )}
        </div>
        <p className="mt-4 text-sm text-[var(--muted-foreground)]">
          On this API surface, the tenant lifecycle is represented by the tenant record’s deletedAt value and the service response status returned by the action itself.
        </p>
      </section>

      <div className="mt-6">
        <Link href="/platform/tenants" className="inline-flex text-sm font-semibold text-[var(--primary)] hover:underline">
          Back to tenants
        </Link>
      </div>
    </>
  )
}
