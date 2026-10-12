import { z } from "zod"

export const orderSchema = z.object({
	items: z.array(z.object({
		productId: z.string().min(1, "Select a product"),
		quantity: z.coerce.number().int("Quantity must be a whole number").min(1, "Quantity must be at least 1"),
	})).min(1, "Add at least one product"),
})

export type OrderFormValues = z.infer<typeof orderSchema>

export const paymentSchema = z.object({
	method: z.enum(["CASH", "QRIS", "TRANSFER"]),
	amount: z.coerce.number().int("Amount must be a whole number").min(1, "Amount must be greater than zero"),
})

export type PaymentFormValues = z.infer<typeof paymentSchema>