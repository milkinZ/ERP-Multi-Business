"use client"

import React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"

import { ApiError } from "@/lib/api/client"
import { EmptyState, PageHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { hasPermission } from "@/lib/permissions"
import { getPlatformAuditLog, platformAuditKeys } from "@/features/platform/api/queries"
import { useAuthStore } from "@/stores/auth.store"

export default function PlatformAuditLogDetailPage() {
  const { auditId } = useParams<{ auditId: string }>()
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const canRead = hasPermission(session, "super-admin.read")
  const query = useQuery({
    queryKey: platformAuditKeys.detail(auditId),
    queryFn: () => getPlatformAuditLog(token as string, auditId),
    enabled: Boolean(token && canRead && auditId),
  })

  if (!canRead) return <UnavailableState title="Audit access is restricted" description="Your platform session does not include the super-admin read permission." />
  if (!token) return <UnavailableState title="Platform authentication is required" description="Sign in with an authorized platform operator session to view audit details." />
  if (query.isPending) return <div className="h-56 animate-pulse rounded-3xl bg-[var(--muted)]" />
  if (query.isError) { if (query.error instanceof ApiError && query.error.status === 404) return <EmptyState title="Audit record not found" description="The platform API did not return this audit record." />; return <UnavailableState title="Audit record unavailable" description="The platform audit API could not be reached." /> }

  const record = query.data
  if (!record) return <EmptyState title="Audit record not found" description="The platform API returned no audit record." />

  return <><PageHeader eyebrow="Platform console / audit detail" title={record.action} description="Immutable platform audit record returned by the backend." actions={<StatusBadge tone={record.outcome === "SUCCESS" ? "success" : "danger"}>{record.outcome}</StatusBadge>} /><section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-6"><dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[["Timestamp", new Date(record.createdAt).toLocaleString()], ["Actor", `${record.actorType} / ${record.actorUserId}`], ["Actor tenant", record.actorTenantId], ["Resource", `${record.resourceType} / ${record.resourceId}`], ["Target tenant", record.targetTenantId ?? "-"], ["Request ID", record.requestId ?? "-"], ["Correlation ID", record.correlationId ?? "-"]].map(([label, value]) => <div key={label}><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">{label}</dt><dd className="mt-2 break-all text-sm text-[var(--foreground)]">{value}</dd></div>)}</dl><div className="mt-8"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Metadata</p><pre className="mt-2 overflow-x-auto rounded-xl bg-[var(--panel-alt)] p-4 text-xs text-[var(--foreground)]">{JSON.stringify(record.metadata ?? {}, null, 2)}</pre></div><Link href="/platform/audit-logs" className="mt-6 inline-flex rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)]">Back to audit logs</Link></section></>
}