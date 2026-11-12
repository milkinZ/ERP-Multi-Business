import { apiRequest } from "@/lib/api/client";

export type ProductStockMode = "INVENTORY_ITEM" | "RECIPE" | "UNTRACKED";

export type Product = {
  id: string;
  name: string;
  description?: string | null;
  sku?: string | null;
  kitchenCategory?: string | null;
  kitchenPrepTimeMinutes?: number | null;
  price: number;
  isActive?: boolean;
  tenantId?: string;
  outletId?: string | null;
  inventoryItemId?: string | null;
  stockMode: ProductStockMode;
  InventoryItem?: { id: string; isActive: boolean; unit: string | null } | null;
  Recipe?: {
    id: string;
    isActive: boolean;
    revision: number;
    _count: { RecipeItem: number };
  } | null;
  createdAt?: string;
};

export type CreateProductInput = {
  name: string;
  description?: string;
  sku?: string;
  kitchenCategory?: string;
  kitchenPrepTimeMinutes?: number;
  price: number;
  stockMode: ProductStockMode;
  inventoryUnit?: string;
};

export type ProductStockConfiguration = {
  businessType: string;
  defaultStockMode: ProductStockMode;
};

const authHeaders = (accessToken: string) => ({
  Authorization: ["Bearer", accessToken].join(" "),
});

export const productKeys = {
  all: (tenantId: string) => ["products", tenantId] as const,
  detail: (tenantId: string, productId: string) =>
    ["products", tenantId, productId] as const,
};

export function getProducts(accessToken: string) {
  return apiRequest<Product[]>("/products", {
    headers: authHeaders(accessToken),
  });
}

export function getProductStockConfiguration(accessToken: string) {
  return apiRequest<ProductStockConfiguration>(
    "/products/stock-configuration",
    {
      headers: authHeaders(accessToken),
    },
  );
}

export function getProduct(accessToken: string, productId: string) {
  return apiRequest<Product>(`/products/${encodeURIComponent(productId)}`, {
    headers: authHeaders(accessToken),
  });
}

export function createProduct(accessToken: string, input: CreateProductInput) {
  return apiRequest<Product>("/products", {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export function updateProductKitchenSettings(
  accessToken: string,
  productId: string,
  input: {
    kitchenCategory: string | null;
    kitchenPrepTimeMinutes: number | null;
  },
) {
  return apiRequest<Product>(
    `/products/${encodeURIComponent(productId)}/kitchen-settings`,
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
