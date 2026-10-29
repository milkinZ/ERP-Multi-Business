import { apiRequest } from "@/lib/api/client"

export type AuditLogRecord = {
  id: string
  userId: string | null
  tenantId: string
  outletId: string | null
  entity: string
  entityId: string
  action: string
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type AuditLogQuery = {
  page: number
  limit: number
  search?: string
  entity?: string
  action?: string
  userId?: string
}

export type AuditLogListResponse = {
  success: boolean
  message: string
  data: AuditLogRecord[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export type AuditLogDetailResponse = {
  success: boolean
  message: string
  data: AuditLogRecord
}

export const auditLogKeys = {
  list: (tenantId: string, query: AuditLogQuery) =>
    ["audit-logs", tenantId, query] as const,
  detail: (tenantId: string, auditLogId: string) =>
    ["audit-logs", tenantId, auditLogId] as const,
}

const authHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
})

export function getAuditLogs(accessToken: string, query: AuditLogQuery) {
  const params = new URLSearchParams({
    page: String(query.page),
    limit: String(query.limit),
    sortBy: "createdAt",
    sort: "desc",
  })
  for (const key of ["search", "entity", "action", "userId"] as const) {
    const value = query[key]?.trim()
    if (value) params.set(key, value)
  }

  return apiRequest<AuditLogListResponse>(`/audit-logs?${params.toString()}`, {
    headers: authHeaders(accessToken),
  })
}

export function getAuditLog(accessToken: string, auditLogId: string) {
  return apiRequest<AuditLogDetailResponse>(
    `/audit-logs/${encodeURIComponent(auditLogId)}`,
    { headers: authHeaders(accessToken) },
  )
}
