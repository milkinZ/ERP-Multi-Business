import { apiRequest } from "@/lib/api/client";

export type PurchaseOrderStatus =
  | "DRAFT"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "COMPLETED"
  | "CANCELLED";

export type PurchaseOrderItem = {
  id: string;
  purchaseOrderId: string;
  inventoryItemId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  receivedQuantity: number;
  InventoryItem?: {
    id: string;
    code: string;
    name: string;
    unit?: string | null;
    type?: string;
  };
};

export type PurchaseOrderSupplier = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};
export type PurchaseOrderWarehouse = {
  id: string;
  name: string;
  code: string;
  outletId?: string | null;
};

export type PurchaseOrder = {
  id: string;
  poNumber: string;
  status: PurchaseOrderStatus;
  supplierId: string;
  tenantId: string;
  warehouseId: string | null;
  expectedDeliveryDate: string | null;
  totalAmount: number;
  currencyCode: string | null;
  notes: string | null;
  receivedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  Supplier?: PurchaseOrderSupplier | null;
  Warehouse?: PurchaseOrderWarehouse | null;
  PurchaseOrderItem: PurchaseOrderItem[];
};

export type PurchaseOrderItemInput = {
  inventoryItemId: string;
  quantity: number;
  unitPrice: number;
};
export type CreatePurchaseOrderInput = {
  supplierId: string;
  warehouseId?: string;
  expectedDeliveryDate?: string;
  notes?: string;
  items: PurchaseOrderItemInput[];
};
export type UpdatePurchaseOrderInput = {
  supplierId?: string;
  warehouseId?: string;
  expectedDeliveryDate?: string;
  notes?: string;
  items?: Array<PurchaseOrderItemInput & { id?: string }>;
};
export type PurchaseOrderPage = {
  data: PurchaseOrder[];
  pagination: { total: number; skip: number; take: number; pages: number };
};
export type PurchaseOrderReceipt = {
  id: string;
  purchaseOrderId: string;
  createdById: string | null;
  statusAfter: PurchaseOrderStatus;
  note: string | null;
  createdAt: string;
  User?: { id: string; email: string } | null;
  Items: Array<{
    id: string;
    purchaseOrderItemId: string;
    inventoryItemId: string;
    receivedQuantity: number;
    InventoryItem?: {
      id: string;
      code: string;
      name: string;
      unit: string | null;
    };
  }>;
};
export type PurchaseOrderReceiptPage = {
  data: PurchaseOrderReceipt[];
  pagination: { total: number; skip: number; take: number; pages: number };
};
export type PurchasePriceVariance = {
  id: string;
  receiptId: string;
  purchaseOrderId: string;
  purchaseOrderItemId: string;
  inventoryItemId: string;
  warehouseId: string | null;
  quantity: number | string;
  standardUnitCost: number | string;
  actualUnitCost: number | string;
  varianceAmount: number | string;
  currencyCode: string | null;
  createdAt: string;
  accountingStatus: "NOT_POSTED";
  PurchaseOrder: {
    id: string;
    poNumber: string;
    supplierId: string;
    Supplier: { id: string; name: string };
  };
  InventoryItem: {
    id: string;
    code: string;
    name: string;
    unit: string | null;
  };
  Warehouse: { id: string; code: string; name: string } | null;
  Receipt: { id: string; createdAt: string; note: string | null };
};
export type PurchasePriceVarianceReport = {
  data: PurchasePriceVariance[];
  pagination: {
    skip: number;
    take: number;
    total: number;
    pages: number;
  };
  totals: Array<{
    currencyCode: string | null;
    varianceAmount: number | string;
    count: number;
  }>;
  accountingStatus: "NOT_POSTED";
};
export type ReceivePurchaseOrderInput = {
  items: Array<{ purchaseOrderItemId: string; receivedQuantity: number }>;
  note?: string;
};

type PurchaseOrderAggregateResponse = { props: PurchaseOrder };

function normalizePurchaseOrder(
  value: PurchaseOrder | PurchaseOrderAggregateResponse,
): PurchaseOrder {
  return "props" in value ? value.props : value;
}

export const purchaseOrderKeys = {
  all: (tenantId: string) => ["purchase-orders", tenantId] as const,
  list: (
    tenantId: string,
    filters?: {
      status?: PurchaseOrderStatus;
      supplierId?: string;
      skip?: number;
      take?: number;
      search?: string;
      fromDate?: string;
      toDate?: string;
      sortBy?:
        | "createdAt"
        | "expectedDeliveryDate"
        | "totalAmount"
        | "poNumber";
      sortOrder?: "asc" | "desc";
    },
  ) => ["purchase-orders", tenantId, filters ?? {}] as const,
  detail: (tenantId: string, id: string) =>
    ["purchase-orders", tenantId, id] as const,
  receipts: (tenantId: string, id: string, skip?: number, take?: number) =>
    skip === undefined && take === undefined
      ? (["purchase-orders", tenantId, id, "receipts"] as const)
      : ([
          "purchase-orders",
          tenantId,
          id,
          "receipts",
          { skip: skip ?? 0, take: take ?? 10 },
        ] as const),
  priceVariances: (
    tenantId: string,
    filters?: {
      skip?: number;
      take?: number;
      fromDate?: string;
      toDate?: string;
    },
  ) => ["purchase-orders", tenantId, "price-variances", filters ?? {}] as const,
};

const headers = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
});

export function getPurchaseOrders(
  accessToken: string,
  filters?: {
    status?: PurchaseOrderStatus;
    supplierId?: string;
    skip?: number;
    take?: number;
    search?: string;
    fromDate?: string;
    toDate?: string;
    sortBy?: "createdAt" | "expectedDeliveryDate" | "totalAmount" | "poNumber";
    sortOrder?: "asc" | "desc";
  },
) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.supplierId) params.set("supplierId", filters.supplierId);
  if (filters?.skip !== undefined) params.set("skip", String(filters.skip));
  if (filters?.take !== undefined) params.set("take", String(filters.take));
  if (filters?.search) params.set("search", filters.search);
  if (filters?.fromDate) params.set("fromDate", filters.fromDate);
  if (filters?.toDate) params.set("toDate", filters.toDate);
  if (filters?.sortBy) params.set("sortBy", filters.sortBy);
  if (filters?.sortOrder) params.set("sortOrder", filters.sortOrder);
  const query = params.toString();
  return apiRequest<PurchaseOrderPage>(
    `/purchase-orders${query ? `?${query}` : ""}`,
    { headers: headers(accessToken) },
  );
}

export function getPurchaseOrder(accessToken: string, id: string) {
  return apiRequest<PurchaseOrder>(
    `/purchase-orders/${encodeURIComponent(id)}`,
    { headers: headers(accessToken) },
  );
}

export function getPurchasePriceVariances(
  accessToken: string,
  filters: { skip?: number; take?: number; fromDate?: string; toDate?: string },
) {
  const params = new URLSearchParams();
  if (filters.skip !== undefined) params.set("skip", String(filters.skip));
  if (filters.take !== undefined) params.set("take", String(filters.take));
  if (filters.fromDate) params.set("fromDate", filters.fromDate);
  if (filters.toDate) params.set("toDate", filters.toDate);
  return apiRequest<PurchasePriceVarianceReport>(
    `/purchase-orders/price-variances?${params}`,
    { headers: headers(accessToken) },
  );
}

export function createPurchaseOrder(
  accessToken: string,
  input: CreatePurchaseOrderInput,
) {
  return apiRequest<PurchaseOrder | PurchaseOrderAggregateResponse>(
    "/purchase-orders",
    {
      method: "POST",
      headers: headers(accessToken),
      body: JSON.stringify(input),
    },
  ).then(normalizePurchaseOrder);
}

export function updatePurchaseOrder(
  accessToken: string,
  id: string,
  input: UpdatePurchaseOrderInput,
) {
  return apiRequest<PurchaseOrder | PurchaseOrderAggregateResponse>(
    `/purchase-orders/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: headers(accessToken),
      body: JSON.stringify(input),
    },
  ).then(normalizePurchaseOrder);
}

export function updatePurchaseOrderStatus(
  accessToken: string,
  id: string,
  status: PurchaseOrderStatus,
) {
  return apiRequest<PurchaseOrder | PurchaseOrderAggregateResponse>(
    `/purchase-orders/${encodeURIComponent(id)}/status`,
    {
      method: "PATCH",
      headers: headers(accessToken),
      body: JSON.stringify({ status }),
    },
  ).then(normalizePurchaseOrder);
}

export function receivePurchaseOrder(
  accessToken: string,
  id: string,
  idempotencyKey: string,
  input: ReceivePurchaseOrderInput,
) {
  return apiRequest<PurchaseOrderReceipt>(
    `/purchase-orders/${encodeURIComponent(id)}/receipts`,
    {
      method: "POST",
      headers: { ...headers(accessToken), "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(input),
    },
  );
}

export function getPurchaseOrderReceipts(
  accessToken: string,
  id: string,
  skip = 0,
  take = 10,
) {
  const params = new URLSearchParams({
    skip: String(skip),
    take: String(take),
  });
  return apiRequest<PurchaseOrderReceiptPage>(
    `/purchase-orders/${encodeURIComponent(id)}/receipts?${params}`,
    { headers: headers(accessToken) },
  );
}

export function deletePurchaseOrder(accessToken: string, id: string) {
  return apiRequest<PurchaseOrder | null>(
    `/purchase-orders/${encodeURIComponent(id)}`,
    { method: "DELETE", headers: headers(accessToken) },
  );
}
