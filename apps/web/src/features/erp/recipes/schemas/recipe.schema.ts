import { z } from "zod"

const recipeItemSchema = z.object({
  ingredientId: z.string().trim().min(1, "Ingredient is required"),
  quantity: z.coerce.number().int("Quantity must be a whole number").positive("Quantity must be greater than zero"),
})

export const recipeSchema = z.object({
  productId: z.string().trim().min(1, "Product is required"),
  items: z.array(recipeItemSchema).min(1, "Add at least one ingredient").superRefine((items, context) => {
    const ingredientIds = new Set<string>()
    items.forEach((item, index) => {
      if (ingredientIds.has(item.ingredientId)) {
        context.addIssue({ code: "custom", path: [index, "ingredientId"], message: "Each ingredient can appear only once" })
      }
      ingredientIds.add(item.ingredientId)
    })
  }),
})

export type RecipeFormValues = z.infer<typeof recipeSchema>
