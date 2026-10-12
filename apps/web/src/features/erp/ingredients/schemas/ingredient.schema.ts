import { z } from "zod"

export const ingredientSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  unit: z.string().trim().min(1, "Unit is required"),
})

export type IngredientFormValues = z.infer<typeof ingredientSchema>
