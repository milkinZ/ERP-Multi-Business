import { apiRequest } from "@/lib/api/client"

export type Role = {
  id: string
  name: string
  description: string | null
  isSystem: boolean
  systemKey: string | null
  tenantId: string
  createdAt: string
  updatedAt: string
  assignedUserCount: number
  permissionCount: number
}

export type RoleListQuery = { page?: number; limit?: number; search?: string; sortBy?: "name" | "createdAt"; sortOrder?: "asc" | "desc" }
export type PaginatedRoles = { data: Role[]; pagination: { page: number; limit: number; total: number; totalPages: number } }

export type Permission = {
  id: string
  code: string
  name: string
}

export type RolePermissions = {
  roleId: string
  permissionCodes: string[]
}

export type RoleInput = {
  name: string
  description?: string
  permissionCodes?: string[]
}

export const roleKeys = {
  all: (tenantId: string) => ["roles", tenantId] as const,
  list: (tenantId: string, query: RoleListQuery) => ["roles", tenantId, "list", query] as const,
  detail: (tenantId: string, roleId: string) => ["roles", tenantId, roleId] as const,
  permissions: (tenantId: string) => ["permissions", tenantId] as const,
  rolePermissions: (tenantId: string, roleId: string) => ["roles", tenantId, roleId, "permissions"] as const,
}

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` }
}

export function getRoles(accessToken: string, query: RoleListQuery = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value))
  }
  return apiRequest<PaginatedRoles>(`/roles${params.size ? `?${params}` : ""}`, { headers: authHeaders(accessToken) })
}

export function getRole(accessToken: string, roleId: string) {
  return apiRequest<Role>(`/roles/${encodeURIComponent(roleId)}`, { headers: authHeaders(accessToken) })
}

export function getPermissions(accessToken: string) {
  return apiRequest<Permission[]>("/permissions", { headers: authHeaders(accessToken) })
}

export function getRolePermissions(accessToken: string, roleId: string) {
  return apiRequest<RolePermissions>(`/roles/${encodeURIComponent(roleId)}/permissions`, { headers: authHeaders(accessToken) })
}

export function createRole(accessToken: string, input: RoleInput) {
  return apiRequest<Role>("/roles", { method: "POST", headers: authHeaders(accessToken), body: JSON.stringify(input) })
}

export function updateRole(accessToken: string, roleId: string, input: RoleInput) {
  return apiRequest<Role>(`/roles/${encodeURIComponent(roleId)}`, { method: "PUT", headers: authHeaders(accessToken), body: JSON.stringify(input) })
}

export function deleteRole(accessToken: string, roleId: string) {
  return apiRequest<{ id: string; deleted: boolean }>(`/roles/${encodeURIComponent(roleId)}`, { method: "DELETE", headers: authHeaders(accessToken) })
}

export function updateRolePermissions(accessToken: string, roleId: string, permissionCodes: string[]) {
  return apiRequest<RolePermissions>(`/roles/${encodeURIComponent(roleId)}/permissions`, {
    method: "PUT",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ permissionCodes }),
  })
}
