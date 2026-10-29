import { z } from "zod";

export const warehouseSchema = z.object({
  name: z.string().trim().min(1, "Warehouse name is required").max(120),
  outletId: z.string().trim().max(128).optional(),
});

export type WarehouseFormValues = z.infer<typeof warehouseSchema>;
