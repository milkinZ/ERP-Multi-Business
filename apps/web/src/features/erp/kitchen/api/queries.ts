import { apiRequest } from "@/lib/api/client";

export type KitchenStatus =
  | "NEW"
  | "QUEUED"
  | "COOKING"
  | "READY"
  | "SERVED"
  | "CANCELLED"
  | "RECALLED";

export type KitchenItem = {
  productId: string;
  productName: string;
  quantity: number;
};

export type KitchenTicket = {
  id: string;
  ticketNumber: string;
  salesOrderId: string;
  tenantId: string;
  outletId: string | null;
  items: KitchenItem[];
  status: KitchenStatus;
  priority: number;
  waitingTooLong?: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
};

type KitchenAggregateResponse = { props: KitchenTicket };

function normalizeTicket(
  value: KitchenTicket | KitchenAggregateResponse,
): KitchenTicket {
  return "props" in value ? value.props : value;
}

const authHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
});

export const kitchenKeys = {
  queue: (tenantId: string, filters?: KitchenQueueFilters) =>
    filters
      ? (["kitchen", tenantId, filters] as const)
      : (["kitchen", tenantId] as const),
  detail: (tenantId: string, orderId: string) =>
    ["kitchen", tenantId, "detail", orderId] as const,
  settings: (tenantId: string) => ["kitchen-settings", tenantId] as const,
};

export type KitchenSettings = {
  waitThresholdMinutes: number;
};

export type KitchenQueueFilters = {
  status?: Extract<KitchenStatus, "QUEUED" | "COOKING" | "READY">;
  search?: string;
};

export const KITCHEN_QUEUE_PAGE_SIZE = 50;

export function getKitchenSettings(accessToken: string) {
  return apiRequest<KitchenSettings>("/kitchen/settings", {
    headers: authHeaders(accessToken),
  });
}

export function updateKitchenWaitThreshold(
  accessToken: string,
  waitThresholdMinutes: number,
) {
  return apiRequest<KitchenSettings>("/kitchen/settings", {
    method: "PATCH",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ waitThresholdMinutes }),
  });
}

export function getKitchenQueue(accessToken: string) {
  return getKitchenQueueWithFilters(accessToken, {});
}

export function getKitchenQueueWithFilters(
  accessToken: string,
  filters: KitchenQueueFilters,
  skip?: number,
) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.search?.trim()) params.set("search", filters.search.trim());
  if (skip !== undefined) {
    params.set("skip", String(skip));
    params.set("take", String(KITCHEN_QUEUE_PAGE_SIZE));
  }
  const query = params.size ? `?${params.toString()}` : "";
  return apiRequest<Array<KitchenTicket | KitchenAggregateResponse>>(
    `/kitchen/orders${query}`,
    { headers: authHeaders(accessToken) },
  ).then((tickets) => tickets.map(normalizeTicket));
}

export function getKitchenTicket(accessToken: string, orderId: string) {
  return apiRequest<KitchenTicket | KitchenAggregateResponse>(
    `/kitchen/orders/${encodeURIComponent(orderId)}`,
    { headers: authHeaders(accessToken) },
  ).then(normalizeTicket);
}

function updateKitchen(
  accessToken: string,
  orderId: string,
  action: "start" | "ready" | "serve" | "cancel" | "recall",
  status: KitchenStatus,
) {
  return apiRequest<KitchenTicket | KitchenAggregateResponse>(
    `/kitchen/orders/${encodeURIComponent(orderId)}/${action}`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    },
  ).then(normalizeTicket);
}

export function startKitchenTicket(accessToken: string, orderId: string) {
  return updateKitchen(accessToken, orderId, "start", "COOKING");
}

export function markKitchenReady(accessToken: string, orderId: string) {
  return updateKitchen(accessToken, orderId, "ready", "READY");
}

export function serveKitchenTicket(accessToken: string, orderId: string) {
  return updateKitchen(accessToken, orderId, "serve", "SERVED");
}

export function cancelKitchenTicket(accessToken: string, orderId: string) {
  return updateKitchen(accessToken, orderId, "cancel", "CANCELLED");
}

export function recallKitchenTicket(accessToken: string, orderId: string) {
  return updateKitchen(accessToken, orderId, "recall", "RECALLED");
}

export function setKitchenTicketPriority(
  accessToken: string,
  orderId: string,
  priority: number,
) {
  return apiRequest<KitchenTicket | KitchenAggregateResponse>(
    `/kitchen/orders/${encodeURIComponent(orderId)}/priority`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ priority }),
    },
  ).then(normalizeTicket);
}
