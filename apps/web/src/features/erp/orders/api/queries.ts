import { apiRequest } from "@/lib/api/client";

export type OrderStatus =
  | "PENDING"
  | "PAID"
  | "COMPLETED"
  | "CANCELLED"
  | "IN_PROGRESS"
  | "READY";
export type OrderMode = "REGULAR" | "OPEN_BILL";
export type PaymentMethod = "CASH" | "QRIS" | "TRANSFER";

export type SalesOrderItem = {
  id: string;
  productId: string;
  quantity: number;
  price: number;
  subtotal: number;
  Product?: {
    id: string;
    name: string;
    sku?: string | null;
  };
};

export type SalesOrder = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  orderMode: OrderMode;
  paymentStatus: "PENDING" | "PAID" | "FAILED" | "REFUNDED";
  paidAmount: number;
  kitchenReleasedAt: string | null;
  totalAmount: number;
  currencyCode: string | null;
  tenantId: string;
  outletId?: string | null;
  createdAt: string;
  SalesOrderItem: SalesOrderItem[];
};

export type CreateOrderInput = {
  orderMode: OrderMode;
  items: Array<{ productId: string; quantity: number }>;
};

export type PayOrderInput = {
  orderId: string;
  method: PaymentMethod;
  amount: number;
};

export const orderKeys = {
  all: (tenantId: string) => ["orders", tenantId] as const,
  detail: (tenantId: string, orderId: string) =>
    ["orders", tenantId, orderId] as const,
};

const authHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
});

export function getOrders(accessToken: string) {
  return apiRequest<SalesOrder[]>("/salesOrders", {
    headers: authHeaders(accessToken),
  });
}

export function getOrder(accessToken: string, orderId: string) {
  return apiRequest<SalesOrder>(`/salesOrders/${encodeURIComponent(orderId)}`, {
    headers: authHeaders(accessToken),
  });
}

export function createOrder(accessToken: string, input: CreateOrderInput) {
  return apiRequest<SalesOrder>("/salesOrders", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });
}

export function updateOrderStatus(
  accessToken: string,
  orderId: string,
  status: OrderStatus,
) {
  return apiRequest<SalesOrder>(
    `/salesOrders/${encodeURIComponent(orderId)}/status`,
    {
      method: "PATCH",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ status }),
    },
  );
}

export function payOrder(accessToken: string, input: PayOrderInput) {
  return apiRequest<{
    id: string;
    orderId: string;
    tenantId: string;
    method: PaymentMethod;
    status: string;
    amount: number;
  }>("/payments/pay", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });
}
