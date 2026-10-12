import { apiRequest } from "@/lib/api/client"

export type PlatformTenant = {
  id: string
  name: string
  businessType?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  address?: string | null
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

export type PlatformTenantListResponse = {
  data: PlatformTenant[]
  total: number
}

export type PlatformSubscription = {
  id: string
  tenantId: string
  planId: string
  status: string
  planType: string
  priceCents: number
  startedAt: string
  endedAt: string | null
  tenant: { id: string; name: string }
  plan: { id: string; type: string; name: string; priceCents: number }
}

export type PlatformPlan = {
  id: string
  type: string
  name: string
  priceCents: number
}

export type PlatformInvoice = {
  id: string
  tenantId: string
  subscriptionId: string | null
  invoiceNumber: string
  amountCents: number
  currency: string
  status: string
  dueAt: string | null
  paidAt: string | null
  createdAt: string
  tenant: { id: string; name: string }
}

export type PlatformReadinessData = {
  database: { ok: boolean }
  redis: { ok: boolean }
  bullmq: { ok: boolean; status?: string }
}

export type PlatformReadiness = {
  data: PlatformReadinessData
}

export type PlatformLiveness = {
  success: boolean
  message: string
  timestamp: string
}

export type PlatformQueueSnapshot = {
  name: string
  waiting: number
  active: number
  delayed: number
  failed: number
  completed: number
}

export type PlatformQueueSnapshotResponse = {
  data: PlatformQueueSnapshot[]
}

export type PlatformAuditLog = {
  id: string
  actorUserId: string
  actorTenantId: string
  actorType: string
  action: string
  resourceType: string
  resourceId: string
  targetTenantId: string | null
  requestId: string | null
  correlationId: string | null
  metadata: Record<string, unknown> | null
  outcome: string
  createdAt: string
}

export type PlatformAuditLogListResponse = {
  data: PlatformAuditLog[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

export const platformObservabilityKeys = {
  all: ["platform-observability"] as const,
  readiness: () => [...platformObservabilityKeys.all, "readiness"] as const,
  liveness: () => [...platformObservabilityKeys.all, "liveness"] as const,
  queues: () => [...platformObservabilityKeys.all, "queues"] as const,
}

export const platformAuditKeys = {
  all: ["platform-audit-logs"] as const,
  list: (params: { page: number; action?: string; resourceType?: string }) => [...platformAuditKeys.all, "list", params] as const,
  detail: (id: string) => [...platformAuditKeys.all, "detail", id] as const,
}

const authHeaders = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` })

export function getPlatformTenants(accessToken: string) {
  return apiRequest<PlatformTenantListResponse>("/super-admin/tenants", {
    headers: authHeaders(accessToken),
  })
}

export function getPlatformTenant(accessToken: string, tenantId: string) {
  return apiRequest<PlatformTenant>(`/super-admin/tenants/${encodeURIComponent(tenantId)}`, {
    headers: authHeaders(accessToken),
  })
}

export function getPlatformSubscriptions(accessToken: string) {
  return apiRequest<PlatformSubscription[]>('/super-admin/subscriptions', {
    headers: authHeaders(accessToken),
  })
}

export function getPlatformSubscription(accessToken: string, subscriptionId: string) {
  return apiRequest<PlatformSubscription>(`/super-admin/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: authHeaders(accessToken),
  })
}

export function getPlatformPlans(accessToken: string) {
  return apiRequest<PlatformPlan[]>('/super-admin/plans', {
    headers: authHeaders(accessToken),
  })
}

export function changePlatformSubscriptionPlan(accessToken: string, tenantId: string, planId: string) {
  return apiRequest<{ tenantId: string; newPlanId: string }>(`/super-admin/tenants/${encodeURIComponent(tenantId)}/plan`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ planId }),
  })
}

export function getPlatformInvoices(accessToken: string) {
  return apiRequest<PlatformInvoice[]>('/super-admin/invoices', {
    headers: authHeaders(accessToken),
  })
}

export function getPlatformInvoice(accessToken: string, invoiceId: string) {
  return apiRequest<PlatformInvoice>(`/super-admin/invoices/${encodeURIComponent(invoiceId)}`, {
    headers: authHeaders(accessToken),
  })
}

export function activatePlatformTenant(accessToken: string, tenantId: string) {
  return apiRequest<{ tenantId: string; status: string }>(`/super-admin/tenants/${encodeURIComponent(tenantId)}/activate`, {
    method: "POST",
    headers: authHeaders(accessToken),
  })
}

export function suspendPlatformTenant(accessToken: string, tenantId: string, reason?: string) {
  return apiRequest<{ tenantId: string; status: string }>(`/super-admin/tenants/${encodeURIComponent(tenantId)}/suspend`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(reason ? { reason } : {}),
  })
}

export function deactivatePlatformTenant(accessToken: string, tenantId: string, reason?: string) {
  return apiRequest<{ tenantId: string; status: string }>(`/super-admin/tenants/${encodeURIComponent(tenantId)}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
    body: JSON.stringify(reason ? { reason } : {}),
  })
}

export function restorePlatformTenant(accessToken: string, tenantId: string) {
  return apiRequest<{ tenantId: string; status: string }>(`/super-admin/tenants/${encodeURIComponent(tenantId)}/restore`, {
    method: "POST",
    headers: authHeaders(accessToken),
  })
}

export function getHealth() {
  return apiRequest<PlatformReadiness>("/health/readiness")
}

export function getLiveness() {
  return apiRequest<PlatformLiveness>("/health/liveness")
}

export function getPlatformQueues(accessToken: string) {
  return apiRequest<PlatformQueueSnapshotResponse>("/admin/queues", {
    headers: authHeaders(accessToken),
  })
}

export function getPlatformAuditLogs(
  accessToken: string,
  params: { page: number; limit?: number; action?: string; resourceType?: string },
) {
  const search = new URLSearchParams({ page: String(params.page), limit: String(params.limit ?? 20) })
  if (params.action) search.set("action", params.action)
  if (params.resourceType) search.set("resourceType", params.resourceType)

  return apiRequest<PlatformAuditLogListResponse>(`/super-admin/audit-logs?${search.toString()}`, {
    headers: authHeaders(accessToken),
  })
}

export function getPlatformAuditLog(accessToken: string, id: string) {
  return apiRequest<PlatformAuditLog>(`/super-admin/audit-logs/${encodeURIComponent(id)}`, {
    headers: authHeaders(accessToken),
  })
}
