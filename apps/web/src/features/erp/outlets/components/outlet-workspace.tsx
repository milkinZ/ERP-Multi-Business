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
  const queryClient = useQueryClient()
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const tenantId = session?.tenantId
  const canRead = hasPermission(session, "outlet.read")
  const canCreate = hasPermission(session, "outlet.create")
  const canDelete = hasPermission(session, "outlet.delete")

  const query = useQuery({ queryKey: tenantId ? outletKeys.all(tenantId) : ["outlets", "unauthenticated"], queryFn: () => getOutlets(token as string), enabled: Boolean(token && tenantId && canRead), staleTime: 60_000 })
  const deleteMutation = useMutation({ mutationFn: (outletId: string) => deleteOutlet(token as string, outletId), retry: 0, onSuccess: async (_, outletId) => { if (tenantId) { await queryClient.invalidateQueries({ queryKey: outletKeys.all(tenantId) }); await queryClient.removeQueries({ queryKey: outletKeys.detail(tenantId, outletId) }) }; setError(null) }, onError: (cause) => setError(cause instanceof ApiError && cause.status === 404 ? "This outlet is no longer available." : cause instanceof Error ? cause.message : "Unable to delete outlet") })

  if (!canRead) return <UnavailableState title="Outlet access is restricted" description="Your current tenant session does not include outlet.read." />
  if (!token || !tenantId) return <UnavailableState title="Outlets are unavailable" description="Sign in to load outlets for the authenticated tenant." />
  if (query.isPending) return <div className="space-y-3"><div className="h-20 animate-pulse rounded-3xl bg-muted" /><div className="h-64 animate-pulse rounded-3xl bg-muted" /></div>
  if (query.isError) return <UnavailableState title="Unable to load outlets" description={query.error instanceof ApiError && query.error.status === 403 ? "Your session is not authorized to view outlets." : "The Outlets API could not be reached. No placeholder outlets are shown."} />

  const outlets = query.data ?? []
  const confirmDelete = (outlet: Outlet) => { if (window.confirm(`Delete outlet ${outlet.name}? This will deactivate it.`)) deleteMutation.mutate(outlet.id) }

  return <div className="space-y-6"><section className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-foreground">Tenant outlet master data</p><p className="mt-1 text-sm text-muted-foreground">Only active outlet records returned by the tenant-scoped backend are shown.</p></div>{canCreate ? <button type="button" onClick={() => { setIsCreateOpen((value) => !value); setError(null) }} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">{isCreateOpen ? "Close form" : "New outlet"}</button> : <StatusBadge tone="neutral">Read only</StatusBadge>}</section>{error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}{isCreateOpen && canCreate ? <section className="rounded-3xl border border-border bg-card p-5"><SectionHeader eyebrow="Outlet action" title="Create outlet" /><OutletForm onSaved={() => setIsCreateOpen(false)} /></section> : null}{!outlets.length ? <EmptyState title="No outlets" description="This tenant has no active outlet records returned by the backend." /> : <section className="overflow-hidden rounded-3xl border border-border bg-card"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-muted text-muted-foreground"><tr>{["Outlet", "Created", "Updated", "Actions"].map((heading) => <th key={heading} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em]">{heading}</th>)}</tr></thead><tbody>{outlets.map((outlet) => <tr key={outlet.id} className="border-t border-border hover:bg-muted/50"><td className="px-4 py-4"><Link href={`/app/outlets/${outlet.id}`} className="font-semibold text-foreground hover:text-primary">{outlet.name}</Link><p className="mt-1 text-xs text-muted-foreground">{outlet.id}</p></td><td className="px-4 py-4 text-muted-foreground">{new Date(outlet.createdAt).toLocaleDateString()}</td><td className="px-4 py-4 text-muted-foreground">{new Date(outlet.updatedAt).toLocaleDateString()}</td><td className="px-4 py-4"><div className="flex gap-3"><Link href={`/app/outlets/${outlet.id}`} className="text-xs font-semibold uppercase tracking-[0.14em] text-primary hover:underline">View</Link>{canDelete ? <button type="button" disabled={deleteMutation.isPending} onClick={() => confirmDelete(outlet)} className="text-xs font-semibold uppercase tracking-[0.14em] text-destructive hover:underline">Delete</button> : null}</div></td></tr>)}</tbody></table></div></section>}</div>
}
