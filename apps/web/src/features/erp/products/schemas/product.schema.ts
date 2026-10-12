import { z } from "zod"

export const productSchema = z.object({
  name: z.string().trim().min(1, "Product name is required"),
  description: z.string().trim().optional(),
  sku: z.string().trim().optional(),
  price: z.coerce.number().int("Price must be a whole number").min(0, "Price cannot be negative"),
})

export type ProductFormValues = z.infer<typeof productSchema>