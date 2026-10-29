import { apiRequest } from "@/lib/api/client";

export type Warehouse = {
  id: string;
  name: string;
  tenantId: string;
  outletId: string | null;
  createdAt: string;
  code: string;
  isActive: boolean;
};

export type CreateWarehouseInput = {
  name: string;
  outletId?: string;
};

export type UpdateWarehouseInput = {
  name?: string;
  outletId?: string | null;
  isActive?: boolean;
};

export type RemoveWarehouseResult = {
  id: string;
  deleted: boolean;
  deactivated: boolean;
};

export type WarehouseStock = {
  inventoryItemId: string;
  code: string;
  name: string;
  type: string;
  unit: string | null;
  quantity: number;
  updatedAt: string;
};

export type WarehouseStockPage = {
  data: WarehouseStock[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export const warehouseKeys = {
  all: (tenantId: string) => ["warehouses", tenantId] as const,
  detail: (tenantId: string, warehouseId: string) =>
    ["warehouses", tenantId, warehouseId] as const,
  stocks: (
    tenantId: string,
    warehouseId: string,
    page: number,
    search: string,
  ) =>
    ["warehouses", tenantId, warehouseId, "stocks", { page, search }] as const,
};

type WarehouseAggregateResponse = { props: Warehouse };

function normalizeWarehouse(
  value: Warehouse | WarehouseAggregateResponse,
): Warehouse {
  return "props" in value ? value.props : value;
}

export function getWarehouses(accessToken: string) {
  return apiRequest<Warehouse[]>("/warehouses", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function getWarehouse(accessToken: string, warehouseId: string) {
  const response = await apiRequest<Warehouse | WarehouseAggregateResponse>(
    `/warehouses/${encodeURIComponent(warehouseId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  return normalizeWarehouse(response);
}

export async function createWarehouse(
  accessToken: string,
  input: CreateWarehouseInput,
) {
  const response = await apiRequest<Warehouse | WarehouseAggregateResponse>(
    "/warehouses",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(input),
    },
  );
  return normalizeWarehouse(response);
}

export async function updateWarehouse(
  accessToken: string,
  warehouseId: string,
  input: UpdateWarehouseInput,
) {
  const response = await apiRequest<Warehouse | WarehouseAggregateResponse>(
    `/warehouses/${encodeURIComponent(warehouseId)}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(input),
    },
  );
  return normalizeWarehouse(response);
}

export function removeWarehouse(accessToken: string, warehouseId: string) {
  return apiRequest<RemoveWarehouseResult>(
    `/warehouses/${encodeURIComponent(warehouseId)}`,
    {
      method: "DELETE",
      headers: { Authorization: ["Bearer", accessToken].join(" ") },
    },
  );
}

export function getWarehouseStocks(
  accessToken: string,
  warehouseId: string,
  query: { page: number; limit: number; search?: string },
) {
  const params = new URLSearchParams({
    page: String(query.page),
    limit: String(query.limit),
  });
  if (query.search) params.set("search", query.search);
  return apiRequest<WarehouseStockPage>(
    `/warehouses/${encodeURIComponent(warehouseId)}/stocks?${params.toString()}`,
    { headers: { Authorization: ["Bearer", accessToken].join(" ") } },
  );
}
