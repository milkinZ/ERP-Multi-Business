"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { EmptyState, PageHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth.store"
import { deleteOutlet, getOutlet, outletKeys, type Outlet } from "@/features/erp/outlets/api/queries"
import { OutletForm } from "@/features/erp/outlets/components/outlet-form"

export function OutletDetailWorkspace({ outletId }: { outletId: string }) {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const queryClient = useQueryClient()
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const tenantId = session?.tenantId
  const canRead = hasPermission(session, "outlet.read")
  const canUpdate = hasPermission(session, "outlet.update")
  const canDelete = hasPermission(session, "outlet.delete")
  const query = useQuery({ queryKey: tenantId ? outletKeys.detail(tenantId, outletId) : ["outlets", "unauthenticated", outletId], queryFn: () => getOutlet(token as string, outletId), enabled: Boolean(token && tenantId && canRead && outletId), staleTime: 60_000 })
  const deleteMutation = useMutation({
    mutationFn: () => deleteOutlet(token as string, outletId),
    retry: 0,
    onSuccess: async () => {
      if (tenantId) {
        await queryClient.invalidateQueries({ queryKey: outletKeys.all(tenantId) })
        await queryClient.removeQueries({ queryKey: outletKeys.detail(tenantId, outletId) })
      }
      window.location.assign("/app/outlets")
    },
  })

  if (!canRead) return <UnavailableState title="Outlet access is restricted" description="Your current tenant session does not include outlet.read." />
  if (query.isPending) return <div className="h-72 animate-pulse rounded-3xl bg-muted" />
  if (query.isError) { if (query.error instanceof ApiError && query.error.status === 404) return <EmptyState title="Outlet not found" description="This outlet is not available in the authenticated tenant scope." />; return <UnavailableState title="Unable to load outlet" description={query.error instanceof ApiError && query.error.status === 403 ? "Your session is not authorized to view outlets." : "The Outlets API could not be reached."} /> }

  const outlet = query.data
  const onSaved = (saved: Outlet) => { queryClient.setQueryData(outletKeys.detail(tenantId as string, outletId), saved); setIsEditOpen(false) }
  const confirmDelete = () => { if (window.confirm(`Delete outlet ${outlet.name}? This will deactivate it.`)) deleteMutation.mutate() }

  return <><PageHeader eyebrow="Tenant application / outlets" title={outlet.name} description="Outlet details returned by the authenticated tenant-scoped API." actions={<StatusBadge tone="info">Tenant outlet</StatusBadge>} /><div className="space-y-6">{isEditOpen && canUpdate ? <section className="rounded-3xl border border-border bg-card p-5"><OutletForm outlet={outlet} onSaved={onSaved} /></section> : null}<section className="rounded-3xl border border-border bg-card p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-foreground">Outlet information</h2><p className="mt-1 break-all text-xs text-muted-foreground">{outlet.id}</p></div><div className="flex gap-3">{canUpdate ? <button type="button" onClick={() => setIsEditOpen((value) => !value)} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground">{isEditOpen ? "Close" : "Edit"}</button> : null}{canDelete ? <button type="button" disabled={deleteMutation.isPending} onClick={confirmDelete} className="rounded-xl border border-destructive/30 px-4 py-2 text-sm font-semibold text-destructive">{deleteMutation.isPending ? "Deleting..." : "Delete"}</button> : null}</div></div><dl className="mt-6 grid gap-5 sm:grid-cols-2"><div><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Name</dt><dd className="mt-2 text-sm text-foreground">{outlet.name}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Tenant ID</dt><dd className="mt-2 break-all text-sm text-foreground">{outlet.tenantId}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Created</dt><dd className="mt-2 text-sm text-foreground">{new Date(outlet.createdAt).toLocaleString()}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Updated</dt><dd className="mt-2 text-sm text-foreground">{new Date(outlet.updatedAt).toLocaleString()}</dd></div></dl><p className="mt-8 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">The current Outlet API does not return warehouse, user, order, inventory, payment, or outlet status data for this detail view.</p><Link href="/app/outlets" className="mt-6 inline-flex rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground">Back to outlets</Link></section></div></>
}
