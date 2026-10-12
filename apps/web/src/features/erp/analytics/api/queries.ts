import { apiRequest } from "@/lib/api/client"

export type AnalyticsSummary = {
  totalProducts: number
  totalOrders: number
  paidOrders: number
  completedOrders: number
  cancelledOrders: number
  totalPayments: number
  totalRevenue: number
  averageOrderValue: number
  pendingOrders: number
}

export type TopProductItem = {
  productId: string
  name: string
  qtySold: number
}

export type AnalyticsQuery = {
  startDate?: string
  endDate?: string
  outletId?: string
}

export const analyticsKeys = {
  summary: (tenantId: string) => ["analytics", tenantId, "summary"] as const,
  topProducts: (tenantId: string) => ["analytics", tenantId, "top-products"] as const,
}

function buildQueryString(params?: AnalyticsQuery) {
  const searchParams = new URLSearchParams()

  if (params?.startDate) searchParams.set("startDate", params.startDate)
  if (params?.endDate) searchParams.set("endDate", params.endDate)
  if (params?.outletId) searchParams.set("outletId", params.outletId)

  const value = searchParams.toString()
  return value ? `?${value}` : ""
}

export function getAnalyticsSummary(accessToken: string, params?: AnalyticsQuery) {
  return apiRequest<AnalyticsSummary>(`/analytics/summary${buildQueryString(params)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

export function getTopProducts(accessToken: string, params?: AnalyticsQuery) {
  return apiRequest<{ items: TopProductItem[] }>(`/analytics/top-products${buildQueryString(params)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}
