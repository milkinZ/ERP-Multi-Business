import { apiRequest } from "@/lib/api/client";

export type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
  tenantId: string;
  createdAt: string;
};

export type SupplierInput = {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
};

export type UpdateSupplierInput = Partial<SupplierInput> & {
  isActive?: boolean;
};

export type SupplierListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  sortBy?: "createdAt" | "name";
  sortOrder?: "asc" | "desc";
};

export type SupplierPage = {
  data: Supplier[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export const supplierKeys = {
  all: (tenantId: string) => ["suppliers", tenantId] as const,
  list: (tenantId: string, query: SupplierListQuery) =>
    ["suppliers", tenantId, "list", query] as const,
  options: (tenantId: string) => ["suppliers", tenantId, "options"] as const,
  detail: (tenantId: string, supplierId: string) =>
    ["suppliers", tenantId, supplierId] as const,
};

type SupplierAggregateResponse = { props: Supplier };

function normalizeSupplier(
  value: Supplier | SupplierAggregateResponse,
): Supplier {
  return "props" in value ? value.props : value;
}

function supplierListPath(query: SupplierListQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return `/suppliers${params.size ? `?${params.toString()}` : ""}`;
}

export function getSupplierPage(accessToken: string, query: SupplierListQuery) {
  return apiRequest<SupplierPage>(supplierListPath(query), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function getSuppliers(accessToken: string) {
  const firstPage = await getSupplierPage(accessToken, { page: 1, limit: 100 });
  const suppliers = [...firstPage.data];
  for (let page = 2; page <= firstPage.pagination.totalPages; page += 1) {
    const nextPage = await getSupplierPage(accessToken, { page, limit: 100 });
    suppliers.push(...nextPage.data);
  }
  return suppliers;
}

export async function getSupplier(accessToken: string, supplierId: string) {
  const response = await apiRequest<Supplier | SupplierAggregateResponse>(
    `/suppliers/${encodeURIComponent(supplierId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  return normalizeSupplier(response);
}

export async function createSupplier(
  accessToken: string,
  input: SupplierInput,
) {
  const response = await apiRequest<Supplier | SupplierAggregateResponse>(
    "/suppliers",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(input),
    },
  );
  return normalizeSupplier(response);
}

export async function updateSupplier(
  accessToken: string,
  supplierId: string,
  input: UpdateSupplierInput,
) {
  const response = await apiRequest<Supplier | SupplierAggregateResponse>(
    `/suppliers/${encodeURIComponent(supplierId)}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(input),
    },
  );
  return normalizeSupplier(response);
}

export function deleteSupplier(accessToken: string, supplierId: string) {
  return apiRequest<{ success: boolean; deactivated: boolean }>(
    `/suppliers/${encodeURIComponent(supplierId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
}
