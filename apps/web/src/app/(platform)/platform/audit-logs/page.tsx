"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"

import { EmptyState, PageHeader, SectionHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { hasPermission } from "@/lib/permissions"
import { getPlatformAuditLogs, platformAuditKeys } from "@/features/platform/api/queries"
import { useAuthStore } from "@/stores/auth.store"

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

export default function PlatformAuditLogsPage() {
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const canRead = hasPermission(session, "super-admin.read")
  const [page, setPage] = useState(1)
  const [action, setAction] = useState("")
  const [resourceType, setResourceType] = useState("")
  const params = { page, limit: 20, action: action || undefined, resourceType: resourceType || undefined }
  const query = useQuery({
    queryKey: platformAuditKeys.list(params),
    queryFn: () => getPlatformAuditLogs(token as string, params),
    enabled: Boolean(token && canRead),
  })

  if (!canRead) return <UnavailableState title="Audit access is restricted" description="Your platform session does not include the super-admin read permission." />
  if (!token) return <UnavailableState title="Platform authentication is required" description="Sign in with an authorized platform operator session to view platform audit records." />

  return (
    <>
      <PageHeader eyebrow="Platform console / governance" title="Audit logs" description="Backend-recorded platform administrator actions. Tenant ERP audit records remain outside this view." actions={<StatusBadge tone="info">Platform scope</StatusBadge>} />
      <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.03)]">
        <SectionHeader eyebrow="Server-side filters" title="Platform activity" />
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"><label className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Action<input value={action} onChange={(event) => { setAction(event.target.value); setPage(1) }} placeholder="super-admin.tenant.suspended" className="mt-2 block w-full rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--foreground)]" /></label><label className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Resource type<input value={resourceType} onChange={(event) => { setResourceType(event.target.value); setPage(1) }} placeholder="TENANT" className="mt-2 block w-full rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--foreground)]" /></label><button type="button" onClick={() => { setAction(""); setResourceType(""); setPage(1) }} className="self-end rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--panel-alt)]">Clear</button></div>
      </section>
      <div className="mt-6">{query.isPending ? <div className="h-64 animate-pulse rounded-3xl bg-[var(--muted)]" /> : query.isError ? <UnavailableState title="Audit records unavailable" description={query.error instanceof ApiError && query.error.status === 403 ? "This platform session is not authorized to read audit records." : "The platform audit API could not be reached."} /> : !query.data?.data.length ? <EmptyState title="No platform audit records" description="The backend returned no records for the current filters." /> : <section className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--panel)]"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-[var(--border)] text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]"><th className="px-4 py-3">Timestamp</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Resource</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Outcome</th></tr></thead><tbody>{query.data.data.map((record) => <tr key={record.id} className="border-b border-[var(--border)] last:border-0"><td className="px-4 py-4 text-[var(--muted-foreground)]">{formatDate(record.createdAt)}</td><td className="px-4 py-4"><Link href={`/platform/audit-logs/${encodeURIComponent(record.id)}`} className="font-semibold text-[var(--foreground)] hover:text-[var(--primary)]">{record.action}</Link></td><td className="px-4 py-4 text-[var(--foreground)]">{record.resourceType} / {record.resourceId}</td><td className="px-4 py-4 text-[var(--muted-foreground)]">{record.actorUserId}</td><td className="px-4 py-4"><StatusBadge tone={record.outcome === "SUCCESS" ? "success" : "danger"}>{record.outcome}</StatusBadge></td></tr>)}</tbody></table></div><div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--muted-foreground)]"><span>Page {query.data.pagination.page} of {query.data.pagination.totalPages} · {query.data.pagination.total} records</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 disabled:opacity-40">Previous</button><button type="button" disabled={page >= query.data.pagination.totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 disabled:opacity-40">Next</button></div></div></section>}</div>
    </>
  )
}