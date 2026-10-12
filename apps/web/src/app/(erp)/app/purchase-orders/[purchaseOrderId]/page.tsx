"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { PageHeader, SectionHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { getInventoryItems, inventoryKeys } from "@/features/erp/inventory/api/queries"
import { getSuppliers, supplierKeys } from "@/features/erp/suppliers/api/queries"
import { getWarehouses, warehouseKeys } from "@/features/erp/warehouses/api/queries"
import { PurchaseOrderForm } from "@/features/erp/purchase-orders/components/purchase-order-form"
import { deletePurchaseOrder, getPurchaseOrder, purchaseOrderKeys, updatePurchaseOrderStatus, type PurchaseOrderStatus } from "@/features/erp/purchase-orders/api/queries"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth.store"

const nextStatuses: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = { DRAFT: ["PENDING", "CANCELLED"], PENDING: ["APPROVED", "REJECTED", "CANCELLED"], APPROVED: ["PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"], PARTIALLY_RECEIVED: ["RECEIVED", "CANCELLED"], RECEIVED: ["COMPLETED"], REJECTED: ["CANCELLED"], CANCELLED: [], COMPLETED: [] }
function statusTone(status: PurchaseOrderStatus) { if (status === "COMPLETED" || status === "RECEIVED") return "success" as const; if (status === "CANCELLED" || status === "REJECTED") return "danger" as const; if (status === "APPROVED" || status === "PARTIALLY_RECEIVED") return "info" as const; return "warning" as const }

export default function PurchaseOrderDetailPage() {
  const { purchaseOrderId } = useParams<{ purchaseOrderId: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const tenantId = session?.tenantId
  const canRead = hasPermission(session, "purchase_order.read")
  const canUpdate = hasPermission(session, "purchase_order.update")
  const canDelete = hasPermission(session, "purchase_order.delete")
  const canTransition = hasPermission(session, "purchase_order.approve") && hasPermission(session, "purchase_order.receive")
  const [isEditing, setIsEditing] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [unknownResult, setUnknownResult] = useState(false)

  const query = useQuery({ queryKey: tenantId ? purchaseOrderKeys.detail(tenantId, purchaseOrderId) : ["purchase-orders", "unauthenticated", purchaseOrderId], queryFn: () => getPurchaseOrder(token as string, purchaseOrderId), enabled: Boolean(token && tenantId && canRead && purchaseOrderId), staleTime: 30_000 })
  const suppliersQuery = useQuery({ queryKey: tenantId ? supplierKeys.all(tenantId) : ["suppliers", "unauthenticated"], queryFn: () => getSuppliers(token as string), enabled: Boolean(token && tenantId && canRead && canUpdate), staleTime: 60_000 })
  const warehousesQuery = useQuery({ queryKey: tenantId ? warehouseKeys.all(tenantId) : ["warehouses", "unauthenticated"], queryFn: () => getWarehouses(token as string), enabled: Boolean(token && tenantId && canRead && canUpdate), staleTime: 60_000 })
  const inventoryQuery = useQuery({ queryKey: tenantId ? inventoryKeys.list(tenantId) : ["inventory", "unauthenticated"], queryFn: () => getInventoryItems(token as string), enabled: Boolean(token && tenantId && canRead && canUpdate), staleTime: 15_000 })

  const invalidate = async (inventoryChanged = false) => { if (!tenantId) return; await queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.all(tenantId) }); await queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.detail(tenantId, purchaseOrderId) }); if (inventoryChanged) { await queryClient.invalidateQueries({ queryKey: inventoryKeys.list(tenantId) }); await queryClient.invalidateQueries({ queryKey: inventoryKeys.history(tenantId) }) } }
  const statusMutation = useMutation({ mutationFn: (status: PurchaseOrderStatus) => { if (!token) throw new Error("Authentication required"); return updatePurchaseOrderStatus(token, purchaseOrderId, status) }, retry: 0, onSuccess: async (_, status) => { await invalidate(["PARTIALLY_RECEIVED", "RECEIVED", "COMPLETED"].includes(status)); setMutationError(null); setUnknownResult(false) }, onError: (cause) => { if (!(cause instanceof ApiError)) { setUnknownResult(true); setMutationError("The status request may have been processed. Verify the Purchase Order and Inventory state before trying again."); return }; setMutationError(cause.status === 403 ? "You do not have permission to change this Purchase Order status." : cause.message); setUnknownResult(false) } })
  const deleteMutation = useMutation({ mutationFn: () => { if (!token) throw new Error("Authentication required"); return deletePurchaseOrder(token, purchaseOrderId) }, retry: 0, onSuccess: async () => { await invalidate(); router.push("/app/purchase-orders") }, onError: (cause) => setMutationError(cause instanceof Error ? cause.message : "Unable to delete Purchase Order") })

  if (!canRead) return <UnavailableState title="Purchase Order access is restricted" description="Your current tenant session does not include the purchase_order.read permission." />
  if (query.isPending) return <div className="h-56 animate-pulse rounded-3xl bg-muted" />
  if (query.isError) return <UnavailableState title="Unable to load Purchase Order" description={query.error instanceof ApiError && (query.error.status === 400 || query.error.status === 404) ? "This Purchase Order was not found in the current tenant." : "The Purchase Order detail API could not be reached."} />
  if (!query.data) return <UnavailableState title="Purchase Order not found" description="The API returned no Purchase Order for this tenant-scoped route." />
  const order = query.data
  const suppliers = suppliersQuery.data ?? []
  const warehouses = warehousesQuery.data ?? []
  const inventoryItems = inventoryQuery.data ?? []
  const canEdit = canUpdate && (order.status === "DRAFT" || order.status === "PENDING")

  return <>
    <PageHeader eyebrow="Tenant application / procurement" title={order.poNumber} description="Purchase Order detail and lifecycle state returned by the transactional backend API." actions={<StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>} />
    {mutationError ? <p role="alert" className={`mb-6 rounded-xl border px-4 py-3 text-sm ${unknownResult ? "border-warning/30 bg-warning/10 text-warning" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>{mutationError}</p> : null}
    {isEditing && canEdit ? <section className="rounded-3xl border border-border bg-card p-5"><SectionHeader eyebrow="Transaction action" title="Edit Purchase Order" />{suppliersQuery.isPending || warehousesQuery.isPending || inventoryQuery.isPending ? <div className="h-32 animate-pulse rounded-2xl bg-muted" /> : <PurchaseOrderForm purchaseOrder={order} suppliers={suppliers} warehouses={warehouses} inventoryItems={inventoryItems} onSaved={() => { setIsEditing(false); query.refetch() }} />}</section> : <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Supplier</p><p className="mt-2 font-medium">{order.Supplier?.name ?? order.supplierId}</p></div><div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Warehouse</p><p className="mt-2 font-medium">{order.Warehouse?.name ?? order.warehouseId ?? "-"}</p></div><div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Total</p><p className="mt-2 text-2xl font-semibold">{order.totalAmount}</p></div><div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Created</p><p className="mt-2 font-medium">{new Date(order.createdAt).toLocaleDateString()}</p></div></section>
      <section className="mt-6 rounded-3xl border border-border bg-card p-5"><SectionHeader eyebrow="Ordered items" title="Line items" /><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-muted text-muted-foreground"><tr>{["Inventory item", "Ordered", "Received", "Unit price", "Subtotal"].map((heading) => <th key={heading} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em]">{heading}</th>)}</tr></thead><tbody>{order.PurchaseOrderItem.map((item) => <tr key={item.id} className="border-t border-border"><td className="px-4 py-4 font-medium text-foreground">{item.InventoryItem?.name ?? item.inventoryItemId}<p className="text-xs text-muted-foreground">{item.InventoryItem?.code ?? ""}</p></td><td className="px-4 py-4">{item.quantity}</td><td className="px-4 py-4">{item.receivedQuantity}</td><td className="px-4 py-4">{item.unitPrice}</td><td className="px-4 py-4">{item.subtotal}</td></tr>)}</tbody></table></div><p className="mt-4 text-xs text-muted-foreground">Received quantities and totals are backend-authoritative.</p></section>
      <section className="mt-6 rounded-3xl border border-border bg-card p-5"><SectionHeader eyebrow="Lifecycle" title="Available status actions" />{canTransition && nextStatuses[order.status].length ? <div className="flex flex-wrap gap-2">{nextStatuses[order.status].map((nextStatus) => <button key={nextStatus} type="button" disabled={statusMutation.isPending} onClick={() => { setMutationError(null); setUnknownResult(false); statusMutation.mutate(nextStatus) }} className="rounded-xl border border-border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-foreground hover:bg-muted disabled:opacity-50">{statusMutation.isPending ? "Submitting..." : `Move to ${nextStatus}`}</button>)}</div> : <p className="text-sm text-muted-foreground">No lifecycle action is available for this status or permission set.</p>}<p className="mt-4 text-sm text-muted-foreground">Receiving is performed by the backend status command. The frontend never calls Inventory stock mutation endpoints for receiving.</p></section>
      <div className="mt-6 flex flex-wrap gap-3">{canEdit ? <button type="button" onClick={() => { setIsEditing(true); setMutationError(null) }} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">Edit Purchase Order</button> : null}{canDelete && order.status === "DRAFT" ? <button type="button" disabled={deleteMutation.isPending} onClick={() => { if (window.confirm(`Delete ${order.poNumber}? This cannot be undone.`)) deleteMutation.mutate() }} className="rounded-xl border border-destructive/30 px-4 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/10">{deleteMutation.isPending ? "Deleting..." : "Delete Purchase Order"}</button> : null}</div>
    </>}
    <Link href="/app/purchase-orders" className="mt-6 inline-flex text-sm font-semibold text-primary hover:underline">Back to Purchase Orders</Link>
  </>
}
