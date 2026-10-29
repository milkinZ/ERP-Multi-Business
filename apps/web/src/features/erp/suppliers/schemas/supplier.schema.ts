import { z } from "zod";

export const supplierSchema = z.object({
  name: z.string().trim().min(1, "Supplier name is required"),
  phone: z.string().trim().optional(),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .optional()
    .or(z.literal("")),
  address: z.string().trim().optional(),
  isActive: z.boolean().optional(),
});

export type SupplierFormValues = z.infer<typeof supplierSchema>;
