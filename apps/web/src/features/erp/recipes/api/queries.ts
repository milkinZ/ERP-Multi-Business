import { apiRequest } from "@/lib/api/client";

export type RecipeIngredient = {
  id: string;
  code: string;
  name: string;
  unit: string | null;
  type: string;
  isActive: boolean;
  tenantId: string;
  createdAt: string;
};

export function getIngredientRecipeUsage(
  accessToken: string,
  inventoryItemId: string,
  query: { page: number; limit: number },
) {
  const params = new URLSearchParams({
    page: String(query.page),
    limit: String(query.limit),
  });
  return apiRequest<IngredientRecipeUsagePage>(
    `/recipes/by-inventory-item/${encodeURIComponent(inventoryItemId)}?${params.toString()}`,
    {
      headers: { Authorization: ["Bearer", accessToken].join(" ") },
    },
  );
}

export type RecipeItem = {
  id: string;
  recipeId: string;
  inventoryItemId: string;
  quantity: number;
  unit: string | null;
  InventoryItem: RecipeIngredient;
};

export type RecipeProduct = {
  id: string;
  name: string;
  description?: string | null;
  sku?: string | null;
  price: number;
  tenantId: string;
  isActive?: boolean;
  createdAt?: string;
};

export type Recipe = {
  id: string;
  tenantId: string;
  productId: string;
  revision: number;
  isActive: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  Product: RecipeProduct;
  RecipeItem: RecipeItem[];
};

export type RecipeSummary = {
  id: string;
  tenantId: string;
  productId: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  isActive: boolean;
  archivedAt: string | null;
  Product: Pick<RecipeProduct, "id" | "name" | "sku" | "isActive">;
  _count: { RecipeItem: number };
};

export type RecipePage = {
  data: RecipeSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type RecipeListQuery = {
  page: number;
  limit: number;
  search?: string;
  includeArchived?: boolean;
};

export type CreateRecipeInput = {
  productId: string;
  items: Array<{
    inventoryItemId: string;
    quantity: number;
    unit?: string;
  }>;
};

export const recipeKeys = {
  list: (tenantId: string, query: RecipeListQuery) =>
    ["recipes", tenantId, "list", query] as const,
  byInventoryItem: (tenantId: string, inventoryItemId: string, page: number) =>
    ["recipes", tenantId, "inventory-item", inventoryItemId, { page }] as const,
  byProduct: (tenantId: string, productId: string) =>
    ["recipes", tenantId, productId] as const,
};

export function getRecipes(accessToken: string, query: RecipeListQuery) {
  const params = new URLSearchParams({
    page: String(query.page),
    limit: String(query.limit),
  });
  if (query.search) params.set("search", query.search);
  if (query.includeArchived) params.set("includeArchived", "true");
  return apiRequest<RecipePage>(`/recipes?${params.toString()}`, {
    headers: { Authorization: ["Bearer", accessToken].join(" ") },
  });
}

export type IngredientRecipeUsage = {
  id: string;
  recipeId: string;
  inventoryItemId: string;
  quantity: number;
  Recipe: {
    id: string;
    createdAt: string;
    Product: { id: string; name: string; sku: string | null };
  };
};

export type IngredientRecipeUsagePage = {
  data: IngredientRecipeUsage[];
  pagination: RecipePage["pagination"];
};

export function getRecipeByProduct(accessToken: string, productId: string) {
  return apiRequest<Recipe | null>(
    `/recipes/${encodeURIComponent(productId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
}

export function createRecipe(accessToken: string, input: CreateRecipeInput) {
  return apiRequest<Recipe>("/recipes", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
}

export function updateRecipe(
  accessToken: string,
  productId: string,
  input: CreateRecipeInput & { expectedRevision: number },
) {
  return apiRequest<Recipe>(`/recipes/${encodeURIComponent(productId)}`, {
    method: "PUT",
    headers: {
      Authorization: ["Bearer", accessToken].join(" "),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export function archiveRecipe(accessToken: string, productId: string) {
  return apiRequest<Recipe>(`/recipes/${encodeURIComponent(productId)}`, {
    method: "DELETE",
    headers: { Authorization: ["Bearer", accessToken].join(" ") },
  });
}

export function restoreRecipe(accessToken: string, productId: string) {
  return apiRequest<Recipe>(
    `/recipes/${encodeURIComponent(productId)}/restore`,
    {
      method: "POST",
      headers: { Authorization: ["Bearer", accessToken].join(" ") },
    },
  );
}
