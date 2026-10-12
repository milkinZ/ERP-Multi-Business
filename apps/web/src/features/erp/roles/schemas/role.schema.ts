import { z } from "zod"

export const roleSchema = z.object({
  name: z.string().trim().min(1, "Role name is required"),
})

export type RoleFormValues = z.infer<typeof roleSchema>
