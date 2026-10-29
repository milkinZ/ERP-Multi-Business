import { z } from "zod"

export const roleSchema = z.object({
  name: z.string().trim().min(1, "Role name is required"),
  description: z.string().trim().max(500, "Use at most 500 characters"),
});

export type RoleFormValues = z.infer<typeof roleSchema>
