import { apiRequest } from "@/lib/api/client"

export type Session = {
  userId: string
  tenantId: string
  roleId: string
  outletId: string | null
  permissions: string[]
}

export function getSession(accessToken?: string | null) {
  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
  return apiRequest<Session>("/auth/me", { headers })
}
