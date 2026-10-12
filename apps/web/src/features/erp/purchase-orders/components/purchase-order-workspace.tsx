"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"

import { EmptyState, SectionHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { getInventoryItems, inventoryKeys } from "@/features/erp/inventory/api/queries"
import { getSuppliers, supplierKeys } from "@/features/erp/suppliers/api/queries"
import { getWarehouses, warehouseKeys } from "@/features/erp/warehouses/api/queries"
import { PurchaseOrderForm } from "@/features/erp/purchase-orders/components/purchase-order-form"
import { getPurchaseOrders, purchaseOrderKeys, type PurchaseOrderStatus } from "@/features/erp/purchase-orders/api/queries"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth.store"

const statuses: PurchaseOrderStatus[] = ["DRAFT", "PENDING", "APPROVED", "PARTIALLY_RECEIVED", "RECEIVED", "COMPLETED", "REJECTED", "CANCELLED"]

function statusTone(status: PurchaseOrderStatus) {
  if (status === "COMPLETED" || status === "RECEIVED") return "success" as const
  if (status === "CANCELLED" || status === "REJECTED") return "danger" as const
  if (status === "APPROVED" || status === "PARTIALLY_RECEIVED") return "info" as const
  return "warning" as const
}

function formatAmount(value: number) { return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value) }

export function PurchaseOrderWorkspace() {
  const router = useRouter()
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const tenantId = session?.tenantId
  const canRead = hasPermission(session, "purchase_order.read")
  const canCreate = hasPermission(session, "purchase_order.create")
  const canReadSuppliers = hasPermission(session, "supplier.read")
  const canReadWarehouses = hasPermission(session, "warehouse.read")
  const canReadInventory = hasPermission(session, "inventory.read")
  const [status, setStatus] = useState<PurchaseOrderStatus | "">("")
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  const suppliersQuery = useQuery({ queryKey: tenantId ? supplierKeys.all(tenantId) : ["suppliers", "unauthenticated"], queryFn: () => getSuppliers(token as string), enabled: Boolean(token && tenantId && canRead && canReadSuppliers), staleTime: 60_000 })
  const warehousesQuery = useQuery({ queryKey: tenantId ? warehouseKeys.all(tenantId) : ["warehouses", "unauthenticated"], queryFn: () => getWarehouses(token as string), enabled: Boolean(token && tenantId && canRead && canReadWarehouses), staleTime: 60_000 })
  const inventoryQuery = useQuery({ queryKey: tenantId ? inventoryKeys.list(tenantId) : ["inventory", "unauthenticated"], queryFn: () => getInventoryItems(token as string), enabled: Boolean(token && tenantId && canRead && canReadInventory), staleTime: 15_000 })
  const ordersQuery = useQuery({ queryKey: tenantId ? purchaseOrderKeys.list(tenantId, status ? { status } : undefined) : ["purchase-orders", "unauthenticated"], queryFn: () => getPurchaseOrders(token as string, status ? { status } : undefined), enabled: Boolean(token && tenantId && canRead), staleTime: 30_000 })

  if (!canRead) return <UnavailableState title="Purchase Order access is restricted" description="Your current tenant session does not include the purchase_order.read permission." />
  if (!canReadSuppliers || !canReadWarehouses || !canReadInventory) return <UnavailableState title="Purchase Order dependencies are restricted" description="Creating and interpreting Purchase Orders requires Supplier, Warehouse, and Inventory read permissions." />
  if (suppliersQuery.isPending || warehousesQuery.isPending || inventoryQuery.isPending || ordersQuery.isPending) return <div className="space-y-3"><div className="h-20 animate-pulse rounded-3xl bg-muted" /><div className="h-64 animate-pulse rounded-3xl bg-muted" /></div>
  if (suppliersQuery.isError || warehousesQuery.isError || inventoryQuery.isError || ordersQuery.isError) return <UnavailableState title="Unable to load Purchase Orders" description={[suppliersQuery.error, warehousesQuery.error, inventoryQuery.error, ordersQuery.error].some((error) => error instanceof ApiError && error.status === 403) ? "Your session is not authorized to read a required Purchase Order dependency." : "A required Purchase Order API could not be reached. No placeholder data is shown."} />

  const suppliers = suppliersQuery.data ?? []
  const warehouses = warehousesQuery.data ?? []
  const inventoryItems = inventoryQuery.data ?? []
  const orders = ordersQuery.data?.data ?? []

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-foreground">Purchase Order transactions</p><p className="mt-1 text-sm text-muted-foreground">Backend-authoritative supplier orders and lifecycle state.</p></div>{canCreate ? <button type="button" onClick={() => setIsCreateOpen((open) => !open)} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">{isCreateOpen ? "Close form" : "New Purchase Order"}</button> : <StatusBadge tone="neutral">Read only</StatusBadge>}</div>
    {isCreateOpen && canCreate ? <section className="rounded-3xl border border-border bg-card p-5"><SectionHeader eyebrow="Transaction action" title="Create Purchase Order" /><PurchaseOrderForm suppliers={suppliers} warehouses={warehouses} inventoryItems={inventoryItems} onSaved={(id) => { setIsCreateOpen(false); router.push(`/app/purchase-orders/${id}`) }} /></section> : null}
    <section className="rounded-3xl border border-border bg-card p-5"><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><SectionHeader eyebrow="Backend list contract" title="Purchase Orders" /><label className="text-sm font-medium text-foreground">Status<select value={status} onChange={(event) => setStatus(event.target.value as PurchaseOrderStatus | "")} className="mt-2 h-10 rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring"><option value="">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div>{!orders.length ? <EmptyState title="No Purchase Orders" description="The backend returned no Purchase Orders for this tenant and filter." /> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-muted text-muted-foreground"><tr>{["PO number", "Supplier", "Warehouse", "Total", "Status", "Created"].map((heading) => <th key={heading} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em]">{heading}</th>)}</tr></thead><tbody>{orders.map((order) => <tr key={order.id} className="border-t border-border hover:bg-muted/50"><td className="px-4 py-4"><Link href={`/app/purchase-orders/${order.id}`} className="font-semibold text-foreground hover:text-primary">{order.poNumber}</Link><p className="text-xs text-muted-foreground">{order.id}</p></td><td className="px-4 py-4 text-muted-foreground">{order.Supplier?.name ?? order.supplierId}</td><td className="px-4 py-4 text-muted-foreground">{order.Warehouse?.name ?? order.warehouseId ?? "-"}</td><td className="px-4 py-4 font-medium text-foreground">{formatAmount(order.totalAmount)}</td><td className="px-4 py-4"><StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge></td><td className="px-4 py-4 text-muted-foreground">{new Date(order.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>}</section>
    <p className="text-xs text-muted-foreground">The API supports skip/take pagination, but this screen intentionally uses the initial backend page and does not emulate pagination client-side.</p>
  </div>
}
