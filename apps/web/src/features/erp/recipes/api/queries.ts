import { apiRequest } from "@/lib/api/client"

export type RecipeIngredient = {
  id: string
  name: string
  unit: string
  tenantId: string
  inventoryItemId: string
  createdAt: string
}

export type RecipeItem = {
  id: string
  recipeId: string
  ingredientId: string
  quantity: number
  Ingredient: RecipeIngredient
}

export type RecipeProduct = {
  id: string
  name: string
  description?: string | null
  sku?: string | null
  price: number
  tenantId: string
  isActive?: boolean
  createdAt?: string
}

export type Recipe = {
  id: string
  tenantId: string
  productId: string
  createdAt: string
  Product: RecipeProduct
  RecipeItem: RecipeItem[]
}

export type CreateRecipeInput = {
  productId: string
  items: Array<{
    ingredientId: string
    quantity: number
  }>
}

export const recipeKeys = {
  byProduct: (tenantId: string, productId: string) => ["recipes", tenantId, productId] as const,
}

export function getRecipeByProduct(accessToken: string, productId: string) {
  return apiRequest<Recipe | null>(`/recipes/${encodeURIComponent(productId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

export function createRecipe(accessToken: string, input: CreateRecipeInput) {
  return apiRequest<Recipe>("/recipes", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  })
}
