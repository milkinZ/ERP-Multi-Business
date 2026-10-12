import { apiRequest } from "@/lib/api/client"

export type Warehouse = {
  id: string
  name: string
  tenantId: string
  outletId: string | null
  createdAt: string
  code: string
}

export type CreateWarehouseInput = {
  name: string
  outletId?: string
}

export const warehouseKeys = {
  all: (tenantId: string) => ["warehouses", tenantId] as const,
  detail: (tenantId: string, warehouseId: string) => ["warehouses", tenantId, warehouseId] as const,
}

type WarehouseAggregateResponse = { props: Warehouse }

function normalizeWarehouse(value: Warehouse | WarehouseAggregateResponse): Warehouse {
  return "props" in value ? value.props : value
}

export function getWarehouses(accessToken: string) {
  return apiRequest<Warehouse[]>("/warehouses", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

export async function getWarehouse(accessToken: string, warehouseId: string) {
  const response = await apiRequest<Warehouse | WarehouseAggregateResponse>(`/warehouses/${encodeURIComponent(warehouseId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  return normalizeWarehouse(response)
}

export async function createWarehouse(accessToken: string, input: CreateWarehouseInput) {
  const response = await apiRequest<Warehouse | WarehouseAggregateResponse>("/warehouses", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  })
  return normalizeWarehouse(response)
}
