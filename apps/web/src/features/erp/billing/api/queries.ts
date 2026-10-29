import { apiDownload, apiRequest } from "@/lib/api/client"

export type Invoice = {
  id: string
  tenantId: string
  subscriptionId?: string | null
  invoiceNumber: string
  amountCents: number
  currency: string
  status: string
  dueAt?: string | null
  paidAt?: string | null
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
  providerPaymentRequestId?: string | null
  providerPaymentId?: string | null
}

export type InvoicePage = {
  data: Invoice[]
  total: number
  skip: number
  take: number
}

export type SubscriptionSummary = {
  id: string
  tenantId: string
  planId: string
  status: string
  planType: string
  priceCents: number
  startedAt: string
  endedAt?: string | null
}

export type SubscriptionHistoryEvent = {
  id: string
  eventType: string
  actorUserId: string | null
  actorType: string
  metadata: Record<string, unknown>
  createdAt: string
}

export type SubscriptionHistoryPage = {
  data: SubscriptionHistoryEvent[]
  total: number
  skip: number
  take: number
}

export const billingKeys = {
  all: (tenantId: string) => ["billing", tenantId] as const,
  invoices: (tenantId: string, skip: number, take: number) => ["billing", tenantId, "invoices", { skip, take }] as const,
  invoice: (tenantId: string, invoiceId: string) => ["billing", tenantId, "invoice", invoiceId] as const,
  subscription: (tenantId: string) => ["billing", tenantId, "subscription"] as const,
}

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` }
}

export function getInvoices(accessToken: string, skip = 0, take = 10) {
  const params = new URLSearchParams({ skip: String(skip), take: String(take) })
  return apiRequest<InvoicePage>(`/billing/invoices?${params.toString()}`, { headers: authHeaders(accessToken) })
}

export function getInvoice(accessToken: string, invoiceId: string) {
  return apiRequest<Invoice>(`/billing/invoices/${encodeURIComponent(invoiceId)}`, { headers: authHeaders(accessToken) })
}

export function cancelInvoice(accessToken: string, invoiceId: string) {
  return apiRequest<Invoice>(`/billing/invoices/${encodeURIComponent(invoiceId)}/cancel`, {
    method: "POST",
    headers: authHeaders(accessToken),
  })
}

export function downloadTenantInvoices(
  accessToken: string,
  filters: { from?: string; to?: string; status?: string },
) {
  const params = new URLSearchParams()
  if (filters.from) params.set("from", filters.from)
  if (filters.to) params.set("to", filters.to)
  if (filters.status) params.set("status", filters.status)
  const query = params.size ? `?${params.toString()}` : ""
  return apiDownload(`/billing/invoices-export.csv${query}`, {
    headers: authHeaders(accessToken),
  })
}

export function getCurrentSubscription(accessToken: string) {
  return apiRequest<SubscriptionSummary>("/subscriptions/current", { headers: authHeaders(accessToken) })
}

export function getSubscriptionHistory(accessToken: string, subscriptionId: string, skip = 0, take = 50) {
  const params = new URLSearchParams({ skip: String(skip), take: String(take) })
  return apiRequest<SubscriptionHistoryPage>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}/history?${params.toString()}`,
    { headers: authHeaders(accessToken) },
  )
}

export function executeBilling(accessToken: string, subscriptionId: string) {
  return apiRequest<void>(`/billing/execute/${encodeURIComponent(subscriptionId)}`, {
    method: "POST",
    headers: authHeaders(accessToken),
  })
}

export function renewSubscription(accessToken: string, subscriptionId: string) {
  return apiRequest<void>(`/billing/renew/${encodeURIComponent(subscriptionId)}`, {
    method: "POST",
    headers: authHeaders(accessToken),
  })
}
