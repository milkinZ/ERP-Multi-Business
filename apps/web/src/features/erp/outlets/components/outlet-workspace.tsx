"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { EmptyState, SectionHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth.store"
import { deleteOutlet, getOutlets, outletKeys, type Outlet } from "@/features/erp/outlets/api/queries"
import { OutletForm } from "@/features/erp/outlets/components/outlet-form"

export function OutletWorkspace() {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<"ACTIVE" | "DELETED" | "ALL">("ACTIVE")
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const tenantId = session?.tenantId
  const canRead = hasPermission(session, "outlet.read")
  const canCreate = hasPermission(session, "outlet.create")
  const canDelete = hasPermission(session, "outlet.delete")

  const listQuery = { page, limit: 20, search: search.trim() || undefined, status, sortBy: "name" as const, sortOrder: "asc" as const }
  const query = useQuery({ queryKey: tenantId ? outletKeys.list(tenantId, listQuery) : ["outlets", "unauthenticated"], queryFn: () => getOutlets(token as string, listQuery), enabled: Boolean(token && tenantId && canRead), staleTime: 60_000 })
  const deleteMutation = useMutation({ mutationFn: (outletId: string) => deleteOutlet(token as string, outletId), retry: 0, onSuccess: async (_, outletId) => { if (tenantId) { await queryClient.invalidateQueries({ queryKey: outletKeys.all(tenantId) }); await queryClient.removeQueries({ queryKey: outletKeys.detail(tenantId, outletId) }) }; setError(null) }, onError: (cause) => setError(cause instanceof ApiError && cause.status === 404 ? "This outlet is no longer available." : cause instanceof Error ? cause.message : "Unable to delete outlet") })

  if (!canRead) return <UnavailableState title="Outlet access is restricted" description="Your current tenant session does not include outlet.read." />
  if (!token || !tenantId) return <UnavailableState title="Outlets are unavailable" description="Sign in to load outlets for the authenticated tenant." />
  if (query.isPending) return <div className="space-y-3"><div className="h-20 animate-pulse rounded-3xl bg-muted" /><div className="h-64 animate-pulse rounded-3xl bg-muted" /></div>
  if (query.isError) return <UnavailableState title="Unable to load outlets" description={query.error instanceof ApiError && query.error.status === 403 ? "Your session is not authorized to view outlets." : "The Outlets API could not be reached. No placeholder outlets are shown."} />

  const outlets = query.data?.data ?? []
  const pagination = query.data?.pagination
  const confirmDelete = (outlet: Outlet) => { if (window.confirm(`Delete outlet ${outlet.name}? This will deactivate it.`)) deleteMutation.mutate(outlet.id) }

  return <div className="space-y-6"><section className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-foreground">Tenant outlet master data</p><p className="mt-1 text-sm text-muted-foreground">Search, sort, and page through tenant-owned outlets. Deleted outlets are retained as archived history.</p></div>{canCreate ? <button type="button" onClick={() => { setIsCreateOpen((value) => !value); setError(null) }} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">{isCreateOpen ? "Close form" : "New outlet"}</button> : <StatusBadge tone="neutral">Read only</StatusBadge>}</section>{error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}{isCreateOpen && canCreate ? <section className="rounded-3xl border border-border bg-card p-5"><SectionHeader eyebrow="Outlet action" title="Create outlet" /><OutletForm onSaved={() => setIsCreateOpen(false)} /></section> : null}<div className="flex flex-col gap-3 sm:flex-row"><label className="block flex-1 text-sm font-medium text-foreground">Search outlets<input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3" /></label><label className="block text-sm font-medium text-foreground">Status<select value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPage(1) }} className="mt-2 h-11 rounded-xl border border-border bg-card px-3"><option value="ACTIVE">Active</option><option value="DELETED">Archived</option><option value="ALL">All</option></select></label></div>{!outlets.length ? <EmptyState title="No outlets" description={search ? "No outlets match these filters." : "No outlet records are available for this filter."} /> : <section className="overflow-hidden rounded-3xl border border-border bg-card"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-muted text-muted-foreground"><tr>{["Outlet", "Status", "Created", "Updated", "Actions"].map((heading) => <th key={heading} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em]">{heading}</th>)}</tr></thead><tbody>{outlets.map((outlet) => <tr key={outlet.id} className="border-t border-border hover:bg-muted/50"><td className="px-4 py-4">{outlet.isActive ? <Link href={`/app/outlets/${outlet.id}`} className="font-semibold text-foreground hover:text-primary">{outlet.name}</Link> : <span className="font-semibold text-muted-foreground">{outlet.name}</span>}<p className="mt-1 text-xs text-muted-foreground">{outlet.id}</p></td><td className="px-4 py-4"><StatusBadge tone={outlet.isActive ? "success" : "neutral"}>{outlet.isActive ? "Active" : "Archived"}</StatusBadge></td><td className="px-4 py-4 text-muted-foreground">{new Date(outlet.createdAt).toLocaleDateString()}</td><td className="px-4 py-4 text-muted-foreground">{new Date(outlet.updatedAt).toLocaleDateString()}</td><td className="px-4 py-4"><div className="flex gap-3">{outlet.isActive ? <><Link href={`/app/outlets/${outlet.id}`} className="text-xs font-semibold uppercase tracking-[0.14em] text-primary hover:underline">View</Link>{canDelete ? <button type="button" disabled={deleteMutation.isPending} onClick={() => confirmDelete(outlet)} className="text-xs font-semibold uppercase tracking-[0.14em] text-destructive hover:underline">Delete</button> : null}</> : <span className="text-xs text-muted-foreground">Historical</span>}</div></td></tr>)}</tbody></table></div><div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground"><span>{pagination?.total ?? 0} outlets</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-border px-3 py-1 disabled:opacity-40">Previous</button><span className="px-2 py-1">{page} / {Math.max(1, pagination?.totalPages ?? 1)}</span><button type="button" disabled={page >= (pagination?.totalPages ?? 1)} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-border px-3 py-1 disabled:opacity-40">Next</button></div></div></section>}</div>
}
