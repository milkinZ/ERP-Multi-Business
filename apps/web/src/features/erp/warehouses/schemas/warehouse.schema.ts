import { z } from "zod"

export const warehouseSchema = z.object({
  name: z.string().trim().min(1, "Warehouse name is required"),
  outletId: z.string().trim().optional(),
})

export type WarehouseFormValues = z.infer<typeof warehouseSchema>
