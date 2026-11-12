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
  category: string | null;
  quantity: number;
  stationId: string | null;
  stationName: string | null;
  prepTimeMinutes: number | null;
  startedAt: string | null;
  completedAt: string | null;
  recipeSnapshotAvailable: boolean;
  ingredients: Array<{
    inventoryItemId: string;
    name: string;
    unit: string;
    quantity: number;
  }>;
};

export type KitchenTicket = {
  id: string;
  ticketNumber: string;
  salesOrderId: string;
  tenantId: string;
  outletId: string | null;
  assignedUser: { id: string; email: string } | null;
  releasedAt: string | null;
  startedAt: string | null;
  readyAt: string | null;
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
  stations: (tenantId: string, outletId?: string) =>
    ["kitchen-stations", tenantId, outletId ?? "all"] as const,
  operators: (tenantId: string) => ["kitchen-operators", tenantId] as const,
  analytics: (tenantId: string, filters: Record<string, string>) =>
    ["kitchen-analytics", tenantId, filters] as const,
};

export type KitchenSettings = {
  waitThresholdMinutes: number;
};

export type KitchenQueueFilters = {
  status?: Extract<KitchenStatus, "QUEUED" | "COOKING" | "READY">;
  search?: string;
  stationId?: string;
};

export const KITCHEN_QUEUE_PAGE_SIZE = 50;

export type KitchenOutlet = { id: string; name: string };
export type KitchenStation = {
  id: string;
  tenantId: string;
  outletId: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
  Categories: Array<{ id: string; category: string }>;
};
export type KitchenOperator = { id: string; email: string };
export type KitchenStationInput = {
  outletId: string;
  name: string;
  categories: string[];
  displayOrder: number;
};
export type KitchenStationUpdate = Partial<
  Omit<KitchenStationInput, "outletId">
> & { isActive?: boolean };
export type KitchenAnalytics = {
  totalTickets: number;
  startAt: string;
  endAt: string;
  stations: Array<{
    stationId: string | null;
    stationName: string;
    ticketCount: number;
    averageWaitSeconds: number | null;
    averageCookSeconds: number | null;
    onTimeItems: number;
    timedItems: number;
    slaPercent: number | null;
  }>;
};

export function getKitchenSettings(accessToken: string) {
  return apiRequest<KitchenSettings>("/kitchen/settings", {
    headers: authHeaders(accessToken),
  });
}

export function getKitchenOutlets(accessToken: string) {
  return apiRequest<KitchenOutlet[]>("/kitchen/outlets", {
    headers: authHeaders(accessToken),
  });
}

export function getKitchenStations(accessToken: string, outletId?: string) {
  const query = outletId
    ? `?outletId=${encodeURIComponent(outletId)}`
    : "";
  return apiRequest<KitchenStation[]>(`/kitchen/stations${query}`, {
    headers: authHeaders(accessToken),
  });
}

export function createKitchenStation(
  accessToken: string,
  input: KitchenStationInput,
) {
  return apiRequest<KitchenStation>("/kitchen/stations", {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export function updateKitchenStation(
  accessToken: string,
  stationId: string,
  input: KitchenStationUpdate,
) {
  return apiRequest<KitchenStation>(
    `/kitchen/stations/${encodeURIComponent(stationId)}`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
}

export function getKitchenOperators(accessToken: string) {
  return apiRequest<KitchenOperator[]>("/kitchen/operators", {
    headers: authHeaders(accessToken),
  });
}

export function assignKitchenTicket(
  accessToken: string,
  orderId: string,
  userId: string | null,
) {
  return apiRequest<KitchenTicket | KitchenAggregateResponse>(
    `/kitchen/orders/${encodeURIComponent(orderId)}/assignment`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId }),
    },
  ).then(normalizeTicket);
}

export function getKitchenAnalytics(
  accessToken: string,
  filters: { startDate?: string; endDate?: string; outletId?: string; stationId?: string },
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const query = params.size ? `?${params.toString()}` : "";
  return apiRequest<KitchenAnalytics>(`/kitchen/analytics${query}`, {
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
  if (filters.stationId) params.set("stationId", filters.stationId);
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
