import { apiRequest } from "@/lib/api/client";

export type IngredientInventoryItem = {
  id: string;
  code: string;
  name: string;
  unit: string | null;
  type: string;
  isActive: boolean;
  tenantId: string;
  createdAt: string;
};

export type Ingredient = {
  id: string;
  name: string;
  unit: string;
  tenantId: string;
  inventoryItemId: string;
  createdAt: string;
  InventoryItem: IngredientInventoryItem;
};

export type CreateIngredientInput = {
  name: string;
  unit: string;
};

export type UpdateIngredientInput = {
  name?: string;
  unit?: string;
  isActive?: boolean;
};

export type IngredientListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
};

export type IngredientPage = {
  data: Ingredient[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export const ingredientKeys = {
  all: (tenantId: string) => ["ingredients", tenantId] as const,
  list: (tenantId: string, query: IngredientListQuery) =>
    ["ingredients", tenantId, "list", query] as const,
  options: (tenantId: string) => ["ingredients", tenantId, "options"] as const,
  detail: (tenantId: string, ingredientId: string) =>
    ["ingredients", tenantId, ingredientId] as const,
};

function ingredientListPath(query: IngredientListQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return `/ingredients${params.size ? `?${params.toString()}` : ""}`;
}

export function getIngredientPage(
  accessToken: string,
  query: IngredientListQuery,
) {
  return apiRequest<IngredientPage>(ingredientListPath(query), {
    headers: { Authorization: ["Bearer", accessToken].join(" ") },
  });
}

export async function getIngredients(accessToken: string) {
  const firstPage = await getIngredientPage(accessToken, {
    page: 1,
    limit: 100,
  });
  const ingredients = [...firstPage.data];
  for (let page = 2; page <= firstPage.pagination.totalPages; page += 1) {
    const nextPage = await getIngredientPage(accessToken, { page, limit: 100 });
    ingredients.push(...nextPage.data);
  }
  return ingredients;
}

export function getIngredient(accessToken: string, ingredientId: string) {
  return apiRequest<Ingredient | null>(
    `/ingredients/${encodeURIComponent(ingredientId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
}

export function createIngredient(
  accessToken: string,
  input: CreateIngredientInput,
) {
  return apiRequest<unknown>("/ingredients", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
}

export function updateIngredient(
  accessToken: string,
  ingredientId: string,
  input: UpdateIngredientInput,
) {
  return apiRequest<Ingredient>(
    `/ingredients/${encodeURIComponent(ingredientId)}`,
    {
      method: "PATCH",
      headers: { Authorization: ["Bearer", accessToken].join(" ") },
      body: JSON.stringify(input),
    },
  );
}

export function removeIngredient(accessToken: string, ingredientId: string) {
  return apiRequest<{ success: boolean; deactivated: boolean }>(
    `/ingredients/${encodeURIComponent(ingredientId)}`,
    {
      method: "DELETE",
      headers: { Authorization: ["Bearer", accessToken].join(" ") },
    },
  );
}
