import { apiRequest } from "@/lib/api/client"

export type Outlet = {
  id: string
  tenantId: string
  name: string
  createdAt: string
  updatedAt: string
  isActive: boolean
}

export type OutletInput = { name: string }
export type OutletListQuery = { page?: number; limit?: number; search?: string; sortBy?: "name" | "createdAt"; sortOrder?: "asc" | "desc"; status?: "ACTIVE" | "DELETED" | "ALL" }
export type PaginatedOutlets = { data: Outlet[]; pagination: { page: number; limit: number; total: number; totalPages: number } }

export const outletKeys = {
  all: (tenantId: string) => ["outlets", tenantId] as const,
  list: (tenantId: string, query: OutletListQuery) => ["outlets", tenantId, "list", query] as const,
  detail: (tenantId: string, outletId: string) => ["outlets", tenantId, outletId] as const,
}

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` }
}

export function getOutlets(accessToken: string, query: OutletListQuery = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value))
  }
  return apiRequest<PaginatedOutlets>(`/outlets${params.size ? `?${params}` : ""}`, { headers: authHeaders(accessToken) })
}

export function getOutlet(accessToken: string, outletId: string) {
  return apiRequest<Outlet>(`/outlets/${encodeURIComponent(outletId)}`, { headers: authHeaders(accessToken) })
}

export function createOutlet(accessToken: string, input: OutletInput) {
  return apiRequest<Outlet>("/outlets", { method: "POST", headers: authHeaders(accessToken), body: JSON.stringify(input) })
}

export function updateOutlet(accessToken: string, outletId: string, input: OutletInput) {
  return apiRequest<Outlet>(`/outlets/${encodeURIComponent(outletId)}`, { method: "PUT", headers: authHeaders(accessToken), body: JSON.stringify(input) })
}

export function deleteOutlet(accessToken: string, outletId: string) {
  return apiRequest<{ id: string; deleted: boolean }>(`/outlets/${encodeURIComponent(outletId)}`, { method: "DELETE", headers: authHeaders(accessToken) })
}
