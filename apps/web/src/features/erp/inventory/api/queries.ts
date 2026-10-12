import { apiRequest } from "@/lib/api/client"

export type InventoryItemType =
  | "PRODUCT"
  | "INGREDIENT"
  | "MATERIAL"
  | "ASSET"
  | "SUPPLY"
  | "SERVICE"

export type InventoryItem = {
  id: string
  code: string
  name: string
  description?: string | null
  unit?: string | null
  type: InventoryItemType
  isActive: boolean
  tenantId: string
  createdAt: string
}

export type InventoryMovementType =
  | "STOCK_IN"
  | "SALE"
  | "WASTE"
  | "ADJUSTMENT"
  | "RETURN"
  | "STOCK_OUT"
  | "PURCHASE"
  | "CONSUMPTION"
  | "PRODUCTION"
  | "TRANSFER"

export type InventoryMovement = {
  id: string
  tenantId: string
  type: InventoryMovementType
  quantity: number
  note?: string | null
  createdAt: string
  afterQuantity?: number | null
  beforeQuantity?: number | null
  createdById?: string | null
  inventoryItemId: string
  referenceId?: string | null
  referenceType?: string | null
  warehouseId?: string | null
  InventoryItem?: {
    id: string
    name: string
    code: string
    type: InventoryItemType
  } | null
  Warehouse?: {
    id: string
    name: string
    code: string
  } | null
  User?: {
    id: string
    email?: string | null
  } | null
}

export const inventoryKeys = {
  list: (tenantId: string) => ["inventory", tenantId] as const,
  history: (tenantId: string) => ["inventory-history", tenantId] as const,
  itemHistory: (tenantId: string, inventoryItemId: string) => ["inventory-history", tenantId, inventoryItemId] as const,
}

const authHeaders = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` })

export function getInventoryItems(accessToken: string, type?: InventoryItemType) {
  const query = type ? `?type=${encodeURIComponent(type)}` : ""
  return apiRequest<InventoryItem[]>(`/inventory/items${query}`, {
    headers: authHeaders(accessToken),
  })
}

export function getInventoryHistory(accessToken: string) {
  return apiRequest<InventoryMovement[]>("/inventory/history", {
    headers: authHeaders(accessToken),
  })
}

export function getInventoryHistoryForItem(accessToken: string, inventoryItemId: string) {
  return apiRequest<InventoryMovement[]>(`/inventory/history/${encodeURIComponent(inventoryItemId)}`, {
    headers: authHeaders(accessToken),
  })
}

export function stockInInventory(
  accessToken: string,
  input: { inventoryItemId: string; warehouseId: string; quantity: number; note?: string },
) {
  return apiRequest<InventoryMovement>("/inventory/stock-in", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  })
}

export function adjustInventory(
  accessToken: string,
  input: { inventoryItemId: string; warehouseId: string; quantity: number; note: string },
) {
  return apiRequest<InventoryMovement>("/inventory/adjustment", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  })
}

export function wasteInventory(
  accessToken: string,
  input: { inventoryItemId: string; warehouseId: string; quantity: number; note: string },
) {
  return apiRequest<InventoryMovement>("/inventory/waste", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  })
}
