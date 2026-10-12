import { apiRequest } from "@/lib/api/client"

export type KitchenStatus = "NEW" | "QUEUED" | "COOKING" | "READY" | "SERVED" | "CANCELLED" | "RECALLED"

export type KitchenItem = {
  productId: string
  productName: string
  quantity: number
}

export type KitchenTicket = {
  id: string
  ticketNumber: string
  salesOrderId: string
  tenantId: string
  outletId: string | null
  items: KitchenItem[]
  status: KitchenStatus
  priority: number
  createdById: string | null
  createdAt: string
  updatedAt: string
}

type KitchenAggregateResponse = { props: KitchenTicket }

function normalizeTicket(value: KitchenTicket | KitchenAggregateResponse): KitchenTicket {
  return "props" in value ? value.props : value
}

export const kitchenKeys = {
  queue: (tenantId: string) => ["kitchen", tenantId] as const,
}

export function getKitchenQueue(accessToken: string) {
  return apiRequest<Array<KitchenTicket | KitchenAggregateResponse>>("/kitchen/orders", {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).then((tickets) => tickets.map(normalizeTicket))
}

function updateKitchen(accessToken: string, orderId: string, action: "start" | "ready" | "serve" | "cancel" | "recall", status: KitchenStatus) {
  return apiRequest<KitchenTicket | KitchenAggregateResponse>(`/kitchen/orders/${encodeURIComponent(orderId)}/${action}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ status }),
  }).then(normalizeTicket)
}

export function startKitchenTicket(accessToken: string, orderId: string) { return updateKitchen(accessToken, orderId, "start", "COOKING") }
export function markKitchenReady(accessToken: string, orderId: string) { return updateKitchen(accessToken, orderId, "ready", "READY") }
export function serveKitchenTicket(accessToken: string, orderId: string) { return updateKitchen(accessToken, orderId, "serve", "SERVED") }
export function cancelKitchenTicket(accessToken: string, orderId: string) { return updateKitchen(accessToken, orderId, "cancel", "CANCELLED") }
export function recallKitchenTicket(accessToken: string, orderId: string) { return updateKitchen(accessToken, orderId, "recall", "RECALLED") }
