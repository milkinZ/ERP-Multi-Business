import { apiRequest } from "@/lib/api/client";

export type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  contactPerson: string | null;
  taxNumber: string | null;
  isActive: boolean;
  tenantId: string;
  createdAt: string;
};

export type SupplierInput = {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  contactPerson?: string;
  taxNumber?: string;
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

export type SupplierItemOffer = {
  id: string;
  supplierId: string;
  inventoryItemId: string;
  supplierSku: string | null;
  unit: string;
  unitPrice: string | number;
  currencyCode: string;
  minimumOrderQuantity: string | number | null;
  leadTimeDays: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  InventoryItem: {
    id: string;
    code: string;
    name: string;
    unit: string | null;
  };
};

export type SupplierItemOfferPage = {
  data: SupplierItemOffer[];
  pagination: {
    skip: number;
    take: number;
    total: number;
    hasMore: boolean;
  };
};

export const supplierKeys = {
  all: (tenantId: string) => ["suppliers", tenantId] as const,
  list: (tenantId: string, query: SupplierListQuery) =>
    ["suppliers", tenantId, "list", query] as const,
  options: (tenantId: string) => ["suppliers", tenantId, "options"] as const,
  detail: (tenantId: string, supplierId: string) =>
    ["suppliers", tenantId, supplierId] as const,
  offers: (tenantId: string, supplierId: string, skip: number) =>
    ["suppliers", tenantId, supplierId, "offers", skip] as const,
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

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
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

export function getSupplierOffers(
  accessToken: string,
  supplierId: string,
  query: {
    skip: number;
    take: number;
    inventoryItemId?: string;
    asOf?: string;
  },
) {
  const params = new URLSearchParams({
    skip: String(query.skip),
    take: String(query.take),
  });
  if (query.inventoryItemId) {
    params.set("inventoryItemId", query.inventoryItemId);
  }
  if (query.asOf) params.set("asOf", query.asOf);
  return apiRequest<SupplierItemOfferPage>(
    `/suppliers/${encodeURIComponent(supplierId)}/offers?${params.toString()}`,
    { headers: authHeaders(accessToken) },
  );
}

export async function getAllSupplierOffers(
  accessToken: string,
  supplierId: string,
  asOf?: string,
) {
  const offers: SupplierItemOffer[] = [];
  let skip = 0;
  let hasMore = true;
  while (hasMore) {
    const page = await getSupplierOffers(accessToken, supplierId, {
      skip,
      take: 100,
      asOf,
    });
    offers.push(...page.data);
    hasMore = page.pagination.hasMore;
    skip += page.pagination.take;
  }
  return offers;
}

export function createSupplierOffer(
  accessToken: string,
  supplierId: string,
  input: {
    inventoryItemId: string;
    unit: string;
    supplierSku?: string;
    unitPrice: number;
    minimumOrderQuantity?: number;
    leadTimeDays?: number;
    effectiveFrom: string;
    effectiveTo?: string;
  },
) {
  return apiRequest<SupplierItemOffer>(
    `/suppliers/${encodeURIComponent(supplierId)}/offers`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify(input),
    },
  );
}

export function closeSupplierOffer(
  accessToken: string,
  supplierId: string,
  offerId: string,
  effectiveTo: string,
) {
  return apiRequest<SupplierItemOffer>(
    `/suppliers/${encodeURIComponent(supplierId)}/offers/${encodeURIComponent(offerId)}/validity`,
    {
      method: "PATCH",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ effectiveTo }),
    },
  );
}
