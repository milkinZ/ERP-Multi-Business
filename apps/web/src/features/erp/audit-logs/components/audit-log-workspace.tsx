"use client"

import React, { useState } from "react"
import { useQuery } from "@tanstack/react-query"

import {
  EmptyState,
  SectionHeader,
  UnavailableState,
} from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import {
  auditLogKeys,
  getAuditLog,
  getAuditLogs,
  type AuditLogQuery,
  type AuditLogRecord,
} from "@/features/erp/audit-logs/api/queries"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth.store"

const PAGE_SIZE = 20

function formatTimestamp(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function describeApiError(error: unknown) {
  if (error instanceof ApiError && error.status === 403) {
    return "Your session is not authorized to view tenant audit logs."
  }
  return "The tenant audit-log API could not be reached. No placeholder records are shown."
}

export function AuditLogWorkspace() {
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const tenantId = session?.tenantId
  const canRead = hasPermission(session, "audit-log.read")
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({
    search: "",
    entity: "",
    action: "",
    userId: "",
  })
  const [appliedFilters, setAppliedFilters] = useState(filters)
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null)
  const query: AuditLogQuery = {
    page,
    limit: PAGE_SIZE,
    ...appliedFilters,
  }

  const listQuery = useQuery({
    queryKey: tenantId
      ? auditLogKeys.list(tenantId, query)
      : ["audit-logs", "unauthenticated"],
    queryFn: () => getAuditLogs(token as string, query),
    enabled: Boolean(token && tenantId && canRead),
    staleTime: 30_000,
  })
  const detailQuery = useQuery({
    queryKey:
      tenantId && selectedLogId
        ? auditLogKeys.detail(tenantId, selectedLogId)
        : ["audit-logs", "detail", "unselected"],
    queryFn: () => getAuditLog(token as string, selectedLogId as string),
    enabled: Boolean(token && tenantId && canRead && selectedLogId),
    staleTime: 30_000,
  })

  if (!canRead) {
    return (
      <UnavailableState
        title="Audit-log access is restricted"
        description="Your tenant role does not have the audit-log.read permission."
      />
    )
  }
  if (!token || !tenantId) {
    return (
      <UnavailableState
        title="Tenant audit logs are unavailable"
        description="Sign in to the ERP workspace to view audit records for your tenant."
      />
    )
  }
  if (listQuery.isPending) {
    return (
      <div className="h-64 animate-pulse rounded-[24px] bg-[var(--muted)]" />
    )
  }
  if (listQuery.isError) {
    return (
      <UnavailableState
        title="Unable to load tenant audit logs"
        description={describeApiError(listQuery.error)}
      />
    )
  }

  const result = listQuery.data
  const pagination = result.pagination

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPage(1)
    setSelectedLogId(null)
    setAppliedFilters({
      search: filters.search.trim(),
      entity: filters.entity.trim(),
      action: filters.action.trim(),
      userId: filters.userId.trim(),
    })
  }

  function resetFilters() {
    const emptyFilters = { search: "", entity: "", action: "", userId: "" }
    setFilters(emptyFilters)
    setAppliedFilters(emptyFilters)
    setPage(1)
    setSelectedLogId(null)
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5">
        <SectionHeader
          eyebrow="Tenant governance"
          title="Audit logs"
          action={
            <span className="rounded-full bg-[var(--primary)]/10 px-3 py-1 text-xs font-semibold text-[var(--primary)]">
              Tenant scope
            </span>
          }
        />
        <p className="mb-5 text-sm text-[var(--muted-foreground)]">
          Review recorded actions for your tenant. The API applies tenant and
          current outlet scoping; platform audit records are shown separately.
        </p>
        <form onSubmit={applyFilters} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-[var(--foreground)]">
            Search
            <input
              value={filters.search}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  search: event.target.value,
                }))
              }
              placeholder="Entity, action, or entity ID"
              className="mt-1.5 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
            />
          </label>
          <label className="text-sm font-medium text-[var(--foreground)]">
            Entity
            <input
              value={filters.entity}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  entity: event.target.value,
                }))
              }
              placeholder="For example: Order"
              className="mt-1.5 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
            />
          </label>
          <label className="text-sm font-medium text-[var(--foreground)]">
            Action
            <input
              value={filters.action}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  action: event.target.value,
                }))
              }
              placeholder="For example: CREATED"
              className="mt-1.5 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
            />
          </label>
          <label className="text-sm font-medium text-[var(--foreground)]">
            User ID
            <input
              value={filters.userId}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  userId: event.target.value,
                }))
              }
              placeholder="Filter by actor"
              className="mt-1.5 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="submit"
              className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Apply filters
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]"
            >
              Reset
            </button>
          </div>
        </form>
      </section>

      {result.data.length === 0 ? (
        <EmptyState
          title="No audit records found"
          description="No tenant audit records match the current filters."
        />
      ) : (
        <section className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--panel)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--muted)] text-[var(--muted-foreground)]">
                <tr>
                  {["Timestamp", "Action", "Entity", "Actor", "Outlet", "Details"].map(
                    (heading) => (
                      <th
                        key={heading}
                        className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em]"
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {result.data.map((record) => (
                  <AuditLogRow
                    key={record.id}
                    record={record}
                    selected={selectedLogId === record.id}
                    onToggle={() =>
                      setSelectedLogId((current) =>
                        current === record.id ? null : record.id,
                      )
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--muted-foreground)] sm:flex-row sm:items-center sm:justify-between">
            <span>
              {pagination.total} records · Page {pagination.page} of{" "}
              {Math.max(pagination.totalPages, 1)}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || listQuery.isFetching}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={
                  page >= pagination.totalPages || listQuery.isFetching
                }
                onClick={() => setPage((current) => current + 1)}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      )}

      {selectedLogId ? (
        detailQuery.isError ? (
          <UnavailableState
            title="Unable to load audit-record details"
            description={describeApiError(detailQuery.error)}
          />
        ) : detailQuery.isPending ? (
          <div className="h-36 animate-pulse rounded-[24px] bg-[var(--muted)]" />
        ) : (
          <AuditLogDetails record={detailQuery.data.data} />
        )
      ) : null}
    </div>
  )
}

function AuditLogRow({
  record,
  selected,
  onToggle,
}: {
  record: AuditLogRecord
  selected: boolean
  onToggle: () => void
}) {
  return (
    <tr className="border-t border-[var(--border)] align-top hover:bg-[var(--muted)]/40">
      <td className="whitespace-nowrap px-4 py-4 text-[var(--muted-foreground)]">
        {formatTimestamp(record.createdAt)}
      </td>
      <td className="px-4 py-4 font-semibold text-[var(--foreground)]">
        {record.action}
      </td>
      <td className="px-4 py-4">
        <span className="font-medium text-[var(--foreground)]">
          {record.entity}
        </span>
        <span className="mt-1 block max-w-48 truncate text-xs text-[var(--muted-foreground)]">
          {record.entityId}
        </span>
      </td>
      <td className="px-4 py-4 text-[var(--muted-foreground)]">
        {record.userId ?? "System"}
      </td>
      <td className="px-4 py-4 text-[var(--muted-foreground)]">
        {record.outletId ?? "Tenant-wide"}
      </td>
      <td className="px-4 py-4">
        <button
          type="button"
          aria-expanded={selected}
          onClick={onToggle}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]"
        >
          {selected ? "Hide details" : "View details"}
        </button>
      </td>
    </tr>
  )
}

function AuditLogDetails({ record }: { record: AuditLogRecord }) {
  return (
    <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5">
      <SectionHeader
        eyebrow="Audit record"
        title={`${record.action} · ${record.entity}`}
      />
      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["Record ID", record.id],
          ["Entity ID", record.entityId],
          ["Actor user ID", record.userId ?? "System"],
          ["Outlet ID", record.outletId ?? "Tenant-wide"],
          ["Created", formatTimestamp(record.createdAt)],
          ["Updated", formatTimestamp(record.updatedAt)],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              {label}
            </dt>
            <dd className="mt-1 break-all text-[var(--foreground)]">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          Metadata
        </p>
        <pre className="mt-2 max-h-96 overflow-auto rounded-xl bg-[var(--muted)] p-4 text-xs text-[var(--foreground)]">
          {JSON.stringify(record.metadata ?? {}, null, 2)}
        </pre>
      </div>
    </section>
  )
}
