"use client"

import React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"

import { PageHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { getWarehouse, warehouseKeys } from "@/features/erp/warehouses/api/queries"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth.store"

export default function WarehouseDetailPage() {
  const { warehouseId } = useParams<{ warehouseId: string }>()
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const tenantId = session?.tenantId
  const canRead = hasPermission(session, "warehouse.read")

  const query = useQuery({
    queryKey: tenantId ? warehouseKeys.detail(tenantId, warehouseId) : ["warehouses", "unauthenticated", warehouseId],
    queryFn: () => getWarehouse(token as string, warehouseId),
    enabled: Boolean(token && tenantId && canRead && warehouseId),
    staleTime: 60_000,
  })

  if (!canRead) return <UnavailableState title="Warehouse access is restricted" description="Your current tenant session does not include the warehouse.read permission." />
  if (query.isPending) return <div className="h-48 animate-pulse rounded-3xl border border-border bg-card" />
  if (query.isError) {
    const message = query.error instanceof ApiError && (query.error.status === 400 || query.error.status === 404) ? "This warehouse was not found in the current tenant." : "The Warehouse detail API could not be reached."
    return <UnavailableState title="Unable to load warehouse" description={message} />
  }
  if (!query.data) return <UnavailableState title="Warehouse not found" description="The API returned no warehouse record for this tenant-scoped route." />

  const warehouse = query.data

  return (
    <>
      <PageHeader eyebrow="Tenant application / infrastructure" title={warehouse.name} description="Warehouse master data returned by the tenant-scoped backend API." actions={<StatusBadge tone="info">Stock location</StatusBadge>} />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Warehouse ID</p><p className="mt-2 break-all font-medium">{warehouse.id}</p></div>
        <div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Code</p><p className="mt-2 font-medium">{warehouse.code}</p></div>
        <div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Outlet</p><p className="mt-2 break-all font-medium">{warehouse.outletId ?? "Tenant-wide"}</p></div>
        <div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Created</p><p className="mt-2 font-medium">{new Date(warehouse.createdAt).toLocaleDateString()}</p></div>
      </section>
      <section className="mt-6 rounded-3xl border border-border bg-card p-5"><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Inventory relationship</p><p className="mt-3 text-sm leading-7 text-muted-foreground">This warehouse can be referenced by InventoryStock, InventoryMovement, and PurchaseOrder records in the backend data model. The current Warehouse API does not return those relations or a warehouse-level stock summary.</p></section>
      <section className="mt-6 rounded-3xl border border-border bg-card p-5"><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Unavailable operations</p><p className="mt-3 text-sm leading-7 text-muted-foreground">Update, delete, deactivate, transfer, valuation, and warehouse analytics are unavailable because the current backend does not expose those Warehouse contracts.</p></section>
      <Link href="/app/warehouses" className="mt-6 inline-flex text-sm font-semibold text-primary hover:underline">Back to warehouses</Link>
    </>
  )
}
