"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"

import { EmptyState, SectionHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { hasPermission } from "@/lib/permissions"
import { WarehouseForm } from "@/features/erp/warehouses/components/warehouse-form"
import { getWarehouses, warehouseKeys } from "@/features/erp/warehouses/api/queries"
import { useAuthStore } from "@/stores/auth.store"

export function WarehouseWorkspace() {
  const router = useRouter()
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const tenantId = session?.tenantId
  const canRead = hasPermission(session, "warehouse.read")
  const canCreate = hasPermission(session, "warehouse.create")
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  const query = useQuery({
    queryKey: tenantId ? warehouseKeys.all(tenantId) : ["warehouses", "unauthenticated"],
    queryFn: () => getWarehouses(token as string),
    enabled: Boolean(token && tenantId && canRead),
    staleTime: 60_000,
  })

  if (!canRead) return <UnavailableState title="Warehouse access is restricted" description="Your current tenant session does not include the warehouse.read permission." />
  if (query.isPending) return <div className="space-y-3"><div className="h-20 animate-pulse rounded-3xl bg-muted" /><div className="h-64 animate-pulse rounded-3xl bg-muted" /></div>
  if (query.isError) {
    const message = query.error instanceof ApiError && query.error.status === 403 ? "Your session is not authorized to view warehouses." : "The Warehouses API could not be reached. No warehouse records are shown."
    return <UnavailableState title="Unable to load warehouses" description={message} />
  }

  const warehouses = query.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Warehouse master data</p>
          <p className="mt-1 text-sm text-muted-foreground">Tenant-scoped warehouse locations returned by the backend.</p>
        </div>
        {canCreate ? <button type="button" onClick={() => setIsCreateOpen((open) => !open)} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">{isCreateOpen ? "Close form" : "New warehouse"}</button> : <StatusBadge tone="neutral">Read only</StatusBadge>}
      </div>

      {isCreateOpen && canCreate ? <section className="rounded-3xl border border-border bg-card p-5"><SectionHeader eyebrow="Master data action" title="Create warehouse" /><WarehouseForm onCreated={(warehouseId) => { setIsCreateOpen(false); router.push(`/app/warehouses/${warehouseId}`) }} /></section> : null}

      {!warehouses.length ? <EmptyState title="No warehouses yet" description="This tenant has no warehouse records available from the current backend contract." /> : <>
        <section className="hidden overflow-hidden rounded-3xl border border-border bg-card md:block">
          <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-muted text-muted-foreground"><tr>{["Warehouse", "Code", "Outlet", "Created"].map((heading) => <th key={heading} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em]">{heading}</th>)}</tr></thead><tbody>{warehouses.map((warehouse) => <tr key={warehouse.id} className="border-t border-border transition-colors hover:bg-muted/50"><td className="px-4 py-4"><Link href={`/app/warehouses/${warehouse.id}`} className="font-semibold text-foreground hover:text-primary">{warehouse.name}</Link><p className="mt-1 text-xs text-muted-foreground">{warehouse.id}</p></td><td className="px-4 py-4 text-muted-foreground">{warehouse.code}</td><td className="px-4 py-4 text-muted-foreground">{warehouse.outletId ?? "Tenant-wide"}</td><td className="px-4 py-4 text-muted-foreground">{new Date(warehouse.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>
        </section>
        <section className="space-y-3 md:hidden">{warehouses.map((warehouse) => <Link key={warehouse.id} href={`/app/warehouses/${warehouse.id}`} className="block rounded-2xl border border-border bg-card p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-foreground">{warehouse.name}</p><p className="mt-1 text-xs text-muted-foreground">Code: {warehouse.code}</p></div><StatusBadge tone="info">Warehouse</StatusBadge></div><p className="mt-3 text-xs text-muted-foreground">{warehouse.outletId ? `Outlet: ${warehouse.outletId}` : "Tenant-wide"} · Created {new Date(warehouse.createdAt).toLocaleDateString()}</p></Link>)}</section>
      </>}

      <section className="rounded-3xl border border-border bg-card p-5"><SectionHeader eyebrow="Contract note" title="Inventory boundary" /><p className="text-sm text-muted-foreground">Warehouses are stock locations in the data model, but the Warehouse API does not return stock summaries or movement history. Inventory remains authoritative for stock, adjustments, receiving, waste, and consumption.</p></section>
    </div>
  )
}
