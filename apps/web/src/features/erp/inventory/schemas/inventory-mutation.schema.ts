import { z } from "zod"

export const inventoryMutationSchema = z.object({
  operation: z.enum(["stock-in", "adjustment", "waste"]),
  inventoryItemId: z.string().min(1, "Inventory item is required"),
  warehouseId: z.string().min(1, "Warehouse is required"),
  quantity: z.coerce.number().int("Quantity must be an integer"),
  note: z.string().trim().optional(),
}).superRefine((value, context) => {
  if (value.operation !== "adjustment" && value.quantity <= 0) {
    context.addIssue({ code: "custom", path: ["quantity"], message: "Quantity must be greater than zero" })
  }
  if (value.operation !== "stock-in" && !value.note) {
    context.addIssue({ code: "custom", path: ["note"], message: "Note is required" })
  }
})

export type InventoryMutationValues = z.infer<typeof inventoryMutationSchema>
