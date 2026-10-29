import { apiRequest } from "@/lib/api/client";

export type InventoryItemType =
  | "PRODUCT"
  | "INGREDIENT"
  | "MATERIAL"
  | "ASSET"
  | "SUPPLY"
  | "SERVICE";

export type InventoryItem = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  unit?: string | null;
  type: InventoryItemType;
  isActive: boolean;
  tenantId: string;
  createdAt: string;
  valuationMethod?: InventoryValuationMethod | null;
  movingAverageScope?: MovingAverageScope | null;
  standardCost?: number | string | null;
  averageUnitCost?: number | string | null;
  valuationLockedAt?: string | null;
};

export type InventoryValuationMethod =
  | "FIFO"
  | "MOVING_WEIGHTED_AVERAGE"
  | "STANDARD_COST";

export type MovingAverageScope = "PER_WAREHOUSE" | "PER_ITEM";

export type InventoryValuation = {
  inventoryItemId: string;
  valuationMethod: InventoryValuationMethod | null;
  movingAverageScope: MovingAverageScope | null;
  standardCost: number | string | null;
  averageUnitCost: number | string | null;
  movingAverageItemUnitCost: number | string | null;
  movingAverageItemHistoryReconciled: boolean;
  lockedAt: string | null;
  currencyCode: string | null;
  status: "SETUP_REQUIRED" | "VALUED" | "OPENING_COST_REQUIRED";
  totalQuantity: number;
  totalValue: number | string | null;
  balances: Array<{
    warehouseId: string | null;
    quantity: number;
    inventoryValue: number | string | null;
    averageUnitCost: number | string | null;
    fifoLayerQuantity: number | string;
    fifoLayerValue: number | string;
    traceableFifoQuantity: number | string;
    fifoOpeningCostQuantity: number | string;
    fifoHistoryReconciled: boolean;
    movingAverageWarehouseUnitCost: number | string | null;
    movingAverageWarehouseOpeningCostQuantity: number | string;
    movingAverageWarehouseHistoryReconciled: boolean;
    movingAverageItemOpeningCostQuantity: number | string;
  }>;
};

export type InventoryPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type PaginatedInventoryResponse<T> = {
  data: T[];
  pagination: InventoryPagination;
};

export type InventoryItemQuery = {
  page?: number;
  limit?: number;
  search?: string;
  type?: InventoryItemType;
  warehouseId?: string;
  sortBy?: "createdAt" | "name" | "code";
  sortOrder?: "asc" | "desc";
};

export type InventoryHistoryQuery = {
  page?: number;
  limit?: number;
  search?: string;
  type?: InventoryMovementType;
  warehouseId?: string;
  sortBy?: "createdAt" | "quantity" | "type";
  sortOrder?: "asc" | "desc";
};

export type InventoryItemPage = PaginatedInventoryResponse<InventoryItem>;

export type InventoryStockBalance = {
  warehouseId: string | null;
  warehouse: {
    id: string;
    name: string;
    code: string;
    outletId: string | null;
  } | null;
  quantity: number;
  updatedAt: string;
};

export type InventoryStockBalances = {
  item: Pick<InventoryItem, "id" | "code" | "name" | "type" | "unit">;
  balances: InventoryStockBalance[];
  totalQuantity: number;
};

export type InventoryAvailability = {
  item: Pick<InventoryItem, "id" | "code" | "name" | "type" | "unit">;
  balances: Array<{
    warehouseId: string | null;
    warehouse: InventoryStockBalance["warehouse"];
    availableQuantity: number;
    reservedQuantity: number;
    onHandQuantity: number;
    replenishment: InventoryReorderRecommendation | null;
  }>;
  totals: {
    availableQuantity: number;
    reservedQuantity: number;
    onHandQuantity: number;
  };
  tenantTotalReplenishment: InventoryReorderRecommendation | null;
  reorderRules: InventoryReorderRule[];
};

export type InventoryReorderScope = "PER_WAREHOUSE" | "TENANT_ITEM_TOTAL";
export type InventoryReorderQuantityStrategy =
  | "TARGET_STOCK"
  | "FIXED_QUANTITY";
export type InventoryReorderAction = "ALERT_ONLY" | "ALERT_AND_SUGGEST";

export type InventoryReorderRuleInput = {
  warehouseId?: string;
  reorderPoint: number;
  quantityStrategy: InventoryReorderQuantityStrategy;
  targetStock?: number;
  fixedOrderQuantity?: number;
  action?: InventoryReorderAction;
};

export type InventoryReorderRule = Omit<
  InventoryReorderRuleInput,
  "warehouseId" | "targetStock" | "fixedOrderQuantity" | "action"
> & {
  id: string;
  scope: InventoryReorderScope;
  warehouseId: string | null;
  warehouse: InventoryStockBalance["warehouse"];
  targetStock: number | null;
  fixedOrderQuantity: number | null;
  action: InventoryReorderAction;
};

export type InventoryReorderRecommendation = {
  scope: InventoryReorderScope;
  warehouseId: string | null;
  action: InventoryReorderAction;
  status: "REORDER_REQUIRED" | "SUFFICIENT";
  reorderPoint: number;
  availableQuantity: number;
  recommendedQuantity: number | null;
};

export type InventoryReorderRules = {
  scope: InventoryReorderScope;
  rules: InventoryReorderRuleInput[];
};

export type InventoryMovementType =
  | "STOCK_IN"
  | "SALE"
  | "WASTE"
  | "ADJUSTMENT"
  | "RETURN"
  | "STOCK_OUT"
  | "PURCHASE"
  | "CONSUMPTION"
  | "PRODUCTION"
  | "TRANSFER";

export type InventoryMovement = {
  id: string;
  tenantId: string;
  type: InventoryMovementType;
  quantity: number;
  note?: string | null;
  createdAt: string;
  afterQuantity?: number | null;
  beforeQuantity?: number | null;
  createdById?: string | null;
  inventoryItemId: string;
  referenceId?: string | null;
  referenceType?: string | null;
  warehouseId?: string | null;
  InventoryItem?: {
    id: string;
    name: string;
    code: string;
    type: InventoryItemType;
  } | null;
  Warehouse?: {
    id: string;
    name: string;
    code: string;
  } | null;
  User?: {
    id: string;
    email?: string | null;
  } | null;
};

export type InventoryMovementPage =
  PaginatedInventoryResponse<InventoryMovement>;

export type WarehouseTransferStatus =
  | "PENDING"
  | "IN_TRANSIT"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "CANCELLED";

export type WarehouseTransferItem = {
  id: string;
  inventoryItemId: string;
  quantity: number;
  receivedQuantity: number;
  InventoryItem?: {
    id: string;
    name: string;
    code: string;
    unit: string | null;
  };
};

export type WarehouseTransferReceipt = {
  id: string;
  transferId: string;
  createdById: string;
  note: string | null;
  createdAt: string;
  CreatedBy?: { id: string; email: string } | null;
  Items: Array<{
    id: string;
    transferItemId: string;
    inventoryItemId: string;
    receivedQuantity: number;
    InventoryItem?: {
      id: string;
      name: string;
      code: string;
      unit: string | null;
    };
  }>;
};

export type WarehouseTransfer = {
  id: string;
  tenantId: string;
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  status: WarehouseTransferStatus;
  note: string | null;
  createdAt: string;
  shippedAt: string | null;
  receivedAt: string | null;
  SourceWarehouse: {
    id: string;
    name: string;
    code: string;
    outletId: string | null;
  };
  DestinationWarehouse: {
    id: string;
    name: string;
    code: string;
    outletId: string | null;
  };
  Items: WarehouseTransferItem[];
  Receipts?: WarehouseTransferReceipt[];
};

export type WarehouseTransferPage = {
  data: WarehouseTransfer[];
  pagination: { total: number; skip: number; take: number; pages: number };
};

export type CreateWarehouseTransferInput = {
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  items: Array<{ inventoryItemId: string; quantity: number }>;
  note?: string;
};

export type ReceiveWarehouseTransferInput = {
  items: Array<{ transferItemId: string; receivedQuantity: number }>;
  note?: string;
};

export const inventoryKeys = {
  list: (tenantId: string, query?: InventoryItemQuery) =>
    query
      ? (["inventory", tenantId, "page", query] as const)
      : (["inventory", tenantId, "page"] as const),
  all: (tenantId: string) => ["inventory", tenantId, "all"] as const,
  stockBalancesForTenant: (tenantId: string) =>
    ["inventory-stock-balances", tenantId] as const,
  item: (tenantId: string, inventoryItemId: string) =>
    ["inventory-item", tenantId, inventoryItemId] as const,
  history: (tenantId: string, query?: InventoryHistoryQuery) =>
    query
      ? (["inventory-history", tenantId, query] as const)
      : (["inventory-history", tenantId] as const),
  itemHistory: (
    tenantId: string,
    inventoryItemId: string,
    query?: InventoryHistoryQuery,
  ) =>
    query
      ? (["inventory-history", tenantId, inventoryItemId, query] as const)
      : (["inventory-history", tenantId, inventoryItemId] as const),
  stockBalances: (tenantId: string, inventoryItemId: string) =>
    ["inventory-stock-balances", tenantId, inventoryItemId] as const,
  availability: (tenantId: string, inventoryItemId: string) =>
    ["inventory-availability", tenantId, inventoryItemId] as const,
  reorderRules: (tenantId: string, inventoryItemId: string) =>
    ["inventory-reorder-rules", tenantId, inventoryItemId] as const,
  valuation: (tenantId: string, inventoryItemId: string) =>
    ["inventory-valuation", tenantId, inventoryItemId] as const,
  transfers: (tenantId: string) => ["inventory-transfers", tenantId] as const,
  transfer: (tenantId: string, transferId: string) =>
    ["inventory-transfers", tenantId, transferId] as const,
};

const authHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
});

export function getInventoryItems(
  accessToken: string,
  query: InventoryItemQuery = {},
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  return apiRequest<InventoryItemPage>(
    `/inventory/items?${params.toString()}`,
    {
      headers: authHeaders(accessToken),
    },
  );
}

export async function getAllInventoryItems(
  accessToken: string,
  query: Pick<InventoryItemQuery, "type"> = {},
) {
  const items: InventoryItem[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const result = await getInventoryItems(accessToken, {
      ...query,
      page,
      limit: 100,
    });
    items.push(...result.data);
    totalPages = result.pagination.totalPages;
    page += 1;
  } while (page <= totalPages);

  return items;
}

export function getInventoryItem(accessToken: string, inventoryItemId: string) {
  return apiRequest<InventoryItem>(
    `/inventory/items/${encodeURIComponent(inventoryItemId)}`,
    {
      headers: authHeaders(accessToken),
    },
  );
}

export function getInventoryValuation(
  accessToken: string,
  inventoryItemId: string,
) {
  return apiRequest<InventoryValuation>(
    `/inventory/items/${encodeURIComponent(inventoryItemId)}/valuation`,
    { headers: authHeaders(accessToken) },
  );
}

export function configureInventoryValuation(
  accessToken: string,
  inventoryItemId: string,
  input: {
    method: InventoryValuationMethod;
    movingAverageScope?: MovingAverageScope;
    standardCost?: number;
    openingCosts?: Array<{ warehouseId: string | null; unitCost: number }>;
  },
) {
  return apiRequest<InventoryValuation>(
    `/inventory/items/${encodeURIComponent(inventoryItemId)}/valuation`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify(input),
    },
  );
}

export function getInventoryHistory(
  accessToken: string,
  query: InventoryHistoryQuery = {},
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  return apiRequest<InventoryMovementPage>(
    `/inventory/history?${params.toString()}`,
    {
      headers: authHeaders(accessToken),
    },
  );
}

export function getInventoryHistoryForItem(
  accessToken: string,
  inventoryItemId: string,
  query: InventoryHistoryQuery = {},
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  return apiRequest<InventoryMovementPage>(
    `/inventory/history/${encodeURIComponent(inventoryItemId)}?${params.toString()}`,
    {
      headers: authHeaders(accessToken),
    },
  );
}

export function getInventoryStockBalances(
  accessToken: string,
  inventoryItemId: string,
) {
  return apiRequest<InventoryStockBalances>(
    `/inventory/items/${encodeURIComponent(inventoryItemId)}/stocks`,
    {
      headers: authHeaders(accessToken),
    },
  );
}

export function getInventoryAvailability(
  accessToken: string,
  inventoryItemId: string,
) {
  return apiRequest<InventoryAvailability>(
    `/inventory/items/${encodeURIComponent(inventoryItemId)}/availability`,
    { headers: authHeaders(accessToken) },
  );
}

export function getInventoryReorderRules(
  accessToken: string,
  inventoryItemId: string,
) {
  return apiRequest<InventoryReorderRule[]>(
    `/inventory/items/${encodeURIComponent(inventoryItemId)}/reorder-rules`,
    { headers: authHeaders(accessToken) },
  );
}

export function replaceInventoryReorderRules(
  accessToken: string,
  inventoryItemId: string,
  input: InventoryReorderRules,
) {
  return apiRequest<InventoryReorderRule[]>(
    `/inventory/items/${encodeURIComponent(inventoryItemId)}/reorder-rules`,
    {
      method: "PUT",
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
}

export function stockInInventory(
  accessToken: string,
  input: {
    inventoryItemId: string;
    warehouseId: string;
    quantity: number;
    note?: string;
  },
) {
  return apiRequest<InventoryMovement>("/inventory/stock-in", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });
}

export function adjustInventory(
  accessToken: string,
  input: {
    inventoryItemId: string;
    warehouseId: string;
    quantity: number;
    note: string;
  },
) {
  return apiRequest<InventoryMovement>("/inventory/adjustment", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });
}

export function wasteInventory(
  accessToken: string,
  input: {
    inventoryItemId: string;
    warehouseId: string;
    quantity: number;
    note: string;
  },
) {
  return apiRequest<InventoryMovement>("/inventory/waste", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });
}

export function getWarehouseTransfers(
  accessToken: string,
  skip = 0,
  take = 20,
) {
  const params = new URLSearchParams({
    skip: String(skip),
    take: String(take),
  });
  return apiRequest<WarehouseTransferPage>(`/inventory/transfers?${params}`, {
    headers: authHeaders(accessToken),
  });
}

export function getWarehouseTransfer(accessToken: string, transferId: string) {
  return apiRequest<WarehouseTransfer>(
    `/inventory/transfers/${encodeURIComponent(transferId)}`,
    {
      headers: authHeaders(accessToken),
    },
  );
}

export function createWarehouseTransfer(
  accessToken: string,
  idempotencyKey: string,
  input: CreateWarehouseTransferInput,
) {
  return apiRequest<WarehouseTransfer>("/inventory/transfers", {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function shipWarehouseTransfer(accessToken: string, transferId: string) {
  return apiRequest<WarehouseTransfer>(
    `/inventory/transfers/${encodeURIComponent(transferId)}/ship`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
    },
  );
}

export function receiveWarehouseTransfer(
  accessToken: string,
  transferId: string,
  idempotencyKey: string,
  input: ReceiveWarehouseTransferInput,
) {
  return apiRequest<WarehouseTransferReceipt>(
    `/inventory/transfers/${encodeURIComponent(transferId)}/receipts`,
    {
      method: "POST",
      headers: {
        ...authHeaders(accessToken),
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(input),
    },
  );
}

export function cancelWarehouseTransfer(
  accessToken: string,
  transferId: string,
) {
  return apiRequest<WarehouseTransfer>(
    `/inventory/transfers/${encodeURIComponent(transferId)}/cancel`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
    },
  );
}
