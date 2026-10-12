import { apiRequest } from "@/lib/api/client"

export type PurchaseOrderStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "COMPLETED" | "CANCELLED"

export type PurchaseOrderItem = {
  id: string
  purchaseOrderId: string
  inventoryItemId: string
  quantity: number
  unitPrice: number
  subtotal: number
  receivedQuantity: number
  InventoryItem?: { id: string; code: string; name: string; unit?: string | null; type?: string }
}

export type PurchaseOrderSupplier = { id: string; name: string; phone?: string | null; email?: string | null; address?: string | null }
export type PurchaseOrderWarehouse = { id: string; name: string; code: string; outletId?: string | null }

export type PurchaseOrder = {
  id: string
  poNumber: string
  status: PurchaseOrderStatus
  supplierId: string
  tenantId: string
  warehouseId: string | null
  expectedDeliveryDate: string | null
  totalAmount: number
  notes: string | null
  receivedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  Supplier?: PurchaseOrderSupplier | null
  Warehouse?: PurchaseOrderWarehouse | null
  PurchaseOrderItem: PurchaseOrderItem[]
}

export type PurchaseOrderItemInput = { inventoryItemId: string; quantity: number; unitPrice: number }
export type CreatePurchaseOrderInput = { supplierId: string; warehouseId?: string; expectedDeliveryDate?: string; notes?: string; items: PurchaseOrderItemInput[] }
export type UpdatePurchaseOrderInput = { supplierId?: string; warehouseId?: string; expectedDeliveryDate?: string; notes?: string; items?: Array<PurchaseOrderItemInput & { id?: string }> }
export type PurchaseOrderPage = { data: PurchaseOrder[]; pagination: { total: number; skip: number; take: number; pages: number } }

type PurchaseOrderAggregateResponse = { props: PurchaseOrder }

function normalizePurchaseOrder(value: PurchaseOrder | PurchaseOrderAggregateResponse): PurchaseOrder {
  return "props" in value ? value.props : value
}

export const purchaseOrderKeys = {
  all: (tenantId: string) => ["purchase-orders", tenantId] as const,
  list: (tenantId: string, filters?: { status?: PurchaseOrderStatus; supplierId?: string }) => ["purchase-orders", tenantId, filters ?? {}] as const,
  detail: (tenantId: string, id: string) => ["purchase-orders", tenantId, id] as const,
}

const headers = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` })

export function getPurchaseOrders(accessToken: string, filters?: { status?: PurchaseOrderStatus; supplierId?: string; skip?: number; take?: number }) {
  const params = new URLSearchParams()
  if (filters?.status) params.set("status", filters.status)
  if (filters?.supplierId) params.set("supplierId", filters.supplierId)
  if (filters?.skip !== undefined) params.set("skip", String(filters.skip))
  if (filters?.take !== undefined) params.set("take", String(filters.take))
  const query = params.toString()
  return apiRequest<PurchaseOrderPage>(`/purchase-orders${query ? `?${query}` : ""}`, { headers: headers(accessToken) })
}

export function getPurchaseOrder(accessToken: string, id: string) {
  return apiRequest<PurchaseOrder>(`/purchase-orders/${encodeURIComponent(id)}`, { headers: headers(accessToken) })
}

export function createPurchaseOrder(accessToken: string, input: CreatePurchaseOrderInput) {
  return apiRequest<PurchaseOrder | PurchaseOrderAggregateResponse>("/purchase-orders", { method: "POST", headers: headers(accessToken), body: JSON.stringify(input) }).then(normalizePurchaseOrder)
}

export function updatePurchaseOrder(accessToken: string, id: string, input: UpdatePurchaseOrderInput) {
  return apiRequest<PurchaseOrder | PurchaseOrderAggregateResponse>(`/purchase-orders/${encodeURIComponent(id)}`, { method: "PATCH", headers: headers(accessToken), body: JSON.stringify(input) }).then(normalizePurchaseOrder)
}

export function updatePurchaseOrderStatus(accessToken: string, id: string, status: PurchaseOrderStatus) {
  return apiRequest<PurchaseOrder | PurchaseOrderAggregateResponse>(`/purchase-orders/${encodeURIComponent(id)}/status`, { method: "PATCH", headers: headers(accessToken), body: JSON.stringify({ status }) }).then(normalizePurchaseOrder)
}

export function deletePurchaseOrder(accessToken: string, id: string) {
  return apiRequest<PurchaseOrder | null>(`/purchase-orders/${encodeURIComponent(id)}`, { method: "DELETE", headers: headers(accessToken) })
}
