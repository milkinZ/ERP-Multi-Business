import { apiRequest } from "@/lib/api/client"

export type UserRoleSummary = {
  id: string
  name: string
}

export type UserOutletSummary = {
  id: string
  name: string
}

export type TenantUser = {
  id: string
  email: string
  roles: UserRoleSummary[]
  outlets: UserOutletSummary[]
  createdAt: string
  updatedAt: string
}

export const userKeys = {
  all: (tenantId: string) => ["users", tenantId] as const,
  detail: (tenantId: string, userId: string) => ["users", tenantId, userId] as const,
}

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` }
}

export function getUsers(accessToken: string) {
  return apiRequest<TenantUser[]>("/users", { headers: authHeaders(accessToken) })
}

export function getUser(accessToken: string, userId: string) {
  return apiRequest<TenantUser>(`/users/${encodeURIComponent(userId)}`, { headers: authHeaders(accessToken) })
}
