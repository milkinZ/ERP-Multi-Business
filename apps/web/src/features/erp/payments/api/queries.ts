import { apiRequest } from "@/lib/api/client"

export type PaymentMethod = "CASH" | "QRIS" | "TRANSFER"
export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED"

export type Payment = {
  id: string
  orderId: string
  tenantId: string
  method: PaymentMethod
  status: PaymentStatus
  amount: number
  referenceNumber?: string | null
  paidAt?: string | null
  createdAt?: string
  SalesOrder?: {
    id: string
    orderNumber?: string | null
    status?: string | null
    totalAmount?: number | null
    tenantId?: string
    outletId?: string | null
    createdAt?: string | null
  } | null
}

export const paymentKeys = {
  all: (tenantId: string) => ["payments", tenantId] as const,
  detail: (tenantId: string, paymentId: string) => ["payments", tenantId, paymentId] as const,
}

export function getPayments(accessToken: string) {
  return apiRequest<Payment[]>("/payments", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

export function getPayment(accessToken: string, paymentId: string) {
  return apiRequest<Payment>(`/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}
