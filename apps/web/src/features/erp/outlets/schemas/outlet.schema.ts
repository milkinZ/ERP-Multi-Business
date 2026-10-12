import { z } from "zod"

export const outletSchema = z.object({
  name: z.string().trim().min(1, "Outlet name is required"),
})

export type OutletFormValues = z.infer<typeof outletSchema>
