import { z } from "zod"

const itemSchema = z.object({
  inventoryItemId: z.string().trim().min(1, "Inventory item is required"),
  quantity: z.coerce.number().min(0.000001, "Quantity must be greater than zero").refine((quantity) => Math.abs(quantity * 1_000_000 - Math.round(quantity * 1_000_000)) < 0.000001, "Use at most six decimal places"),
  unitPrice: z.coerce.number().nonnegative("Unit price cannot be negative").refine((unitPrice) => Math.abs(unitPrice * 1_000_000 - Math.round(unitPrice * 1_000_000)) < 0.000001, "Use at most six decimal places"),
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

export type PurchaseOrderFormInput = z.input<typeof purchaseOrderSchema>
export type PurchaseOrderFormValues = z.output<typeof purchaseOrderSchema>
