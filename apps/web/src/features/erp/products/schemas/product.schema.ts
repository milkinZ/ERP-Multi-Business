import { z } from "zod";

export const productSchema = z
  .object({
    name: z.string().trim().min(1, "Product name is required"),
    description: z.string().trim().optional(),
    sku: z.string().trim().optional(),
    stockMode: z.enum(["INVENTORY_ITEM", "RECIPE", "UNTRACKED"]),
    inventoryUnit: z.string().trim().max(32).optional(),
    kitchenCategory: z.string().trim().min(1).max(64).optional(),
    kitchenPrepTimeMinutes: z.coerce.number().int().min(1).max(1440).optional(),
    price: z.coerce
      .number()
      .int("Price must be a whole number")
      .min(0, "Price cannot be negative"),
  })
  .superRefine((product, context) => {
    if (product.stockMode === "INVENTORY_ITEM" && !product.inventoryUnit) {
      context.addIssue({
        code: "custom",
        path: ["inventoryUnit"],
        message: "Stock unit is required for inventory-tracked products",
      });
    }
  });

export type ProductFormInput = z.input<typeof productSchema>;
export type ProductFormValues = z.output<typeof productSchema>;
