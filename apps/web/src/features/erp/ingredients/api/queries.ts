import { apiRequest } from "@/lib/api/client"

export type IngredientInventoryItem = {
  id: string
  code: string
  name: string
  unit: string | null
  type: string
  isActive: boolean
  tenantId: string
  createdAt: string
}

export type Ingredient = {
  id: string
  name: string
  unit: string
  tenantId: string
  inventoryItemId: string
  createdAt: string
  InventoryItem: IngredientInventoryItem
}

export type CreateIngredientInput = {
  name: string
  unit: string
}

export const ingredientKeys = {
  all: (tenantId: string) => ["ingredients", tenantId] as const,
  detail: (tenantId: string, ingredientId: string) => ["ingredients", tenantId, ingredientId] as const,
}

export function getIngredients(accessToken: string) {
  return apiRequest<Ingredient[]>("/ingredients", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

export function getIngredient(accessToken: string, ingredientId: string) {
  return apiRequest<Ingredient | null>(`/ingredients/${encodeURIComponent(ingredientId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

export function createIngredient(accessToken: string, input: CreateIngredientInput) {
  return apiRequest<unknown>("/ingredients", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  })
}
