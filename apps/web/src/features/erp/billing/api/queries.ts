import { apiRequest } from "@/lib/api/client"

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

export function getCurrentSubscription(accessToken: string) {
  return apiRequest<SubscriptionSummary>("/subscriptions/current", { headers: authHeaders(accessToken) })
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
