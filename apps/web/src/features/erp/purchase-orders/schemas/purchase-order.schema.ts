import { z } from "zod"

const itemSchema = z.object({
  inventoryItemId: z.string().trim().min(1, "Inventory item is required"),
  quantity: z.coerce.number().int("Quantity must be a whole number").positive("Quantity must be greater than zero"),
  unitPrice: z.coerce.number().int("Unit price must be a whole number").nonnegative("Unit price cannot be negative"),
})

export const purchaseOrderSchema = z.object({
  supplierId: z.string().trim().min(1, "Supplier is required"),
  warehouseId: z.string().trim().optional(),
  expectedDeliveryDate: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, "Add at least one inventory item").superRefine((items, context) => {
    const ids = new Set<string>()
    items.forEach((item, index) => {
      if (ids.has(item.inventoryItemId)) context.addIssue({ code: "custom", path: [index, "inventoryItemId"], message: "Each inventory item can appear only once" })
      ids.add(item.inventoryItemId)
    })
  }),
})

export type PurchaseOrderFormValues = z.infer<typeof purchaseOrderSchema>
