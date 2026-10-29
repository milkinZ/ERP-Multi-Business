import { z } from "zod"

const recipeItemSchema = z.object({
  inventoryItemId: z.string().trim().min(1, "Ingredient is required"),
  quantity: z.coerce.number().int("Quantity must be a whole number").positive("Quantity must be greater than zero"),
})

export const recipeSchema = z.object({
  productId: z.string().trim().min(1, "Product is required"),
  items: z.array(recipeItemSchema).min(1, "Add at least one ingredient").superRefine((items, context) => {
    const inventoryItemIds = new Set<string>()
    items.forEach((item, index) => {
      if (inventoryItemIds.has(item.inventoryItemId)) {
        context.addIssue({ code: "custom", path: [index, "inventoryItemId"], message: "Each ingredient can appear only once" })
      }
      inventoryItemIds.add(item.inventoryItemId)
    })
  }),
})

export type RecipeFormValues = z.infer<typeof recipeSchema>
