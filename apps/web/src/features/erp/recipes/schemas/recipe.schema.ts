import { z } from "zod";

const recipeItemSchema = z.object({
  inventoryItemId: z.string().trim().min(1, "Ingredient is required"),
  unit: z
    .string()
    .trim()
    .max(32)
    .optional()
    .transform((unit) => unit || undefined),
  quantity: z.coerce
    .number()
    .min(0.000001, "Quantity must be greater than zero")
    .max(1_000_000_000, "Quantity is too large")
    .refine(
      (quantity) =>
        Math.abs(quantity * 1_000_000 - Math.round(quantity * 1_000_000)) <
        0.000001,
      "Use at most six decimal places",
    ),
});

export const recipeSchema = z.object({
  productId: z.string().trim().min(1, "Product is required"),
  items: z
    .array(recipeItemSchema)
    .min(1, "Add at least one ingredient")
    .superRefine((items, context) => {
      const inventoryItemIds = new Set<string>();
      items.forEach((item, index) => {
        if (inventoryItemIds.has(item.inventoryItemId)) {
          context.addIssue({
            code: "custom",
            path: [index, "inventoryItemId"],
            message: "Each ingredient can appear only once",
          });
        }
        inventoryItemIds.add(item.inventoryItemId);
      });
    }),
});

export type RecipeFormInput = z.input<typeof recipeSchema>;
export type RecipeFormValues = z.output<typeof recipeSchema>;
