"use client"

import React, { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useFieldArray, useForm } from "react-hook-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import { EmptyState, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth.store"
import { getProducts, productKeys, type Product } from "@/features/erp/products/api/queries"
import { createOrder, orderKeys } from "@/features/erp/orders/api/queries"
import { orderSchema, type OrderFormValues } from "@/features/erp/orders/schemas/order.schema"

function formatAmount(value: number) {
	return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)
}

export function OrderForm({ onCreated }: { onCreated: () => void }) {
	const token = useAuthStore((state) => state.accessToken)
	const session = useAuthStore((state) => state.session)
	const tenantId = session?.tenantId
	const canReadProducts = hasPermission(session, "product.read")
	const queryClient = useQueryClient()
	const [serverError, setServerError] = useState<string | null>(null)
	const productsQuery = useQuery({
		queryKey: tenantId ? productKeys.all(tenantId) : ["products", "unauthenticated"],
		queryFn: () => getProducts(token as string),
		enabled: Boolean(token && tenantId && canReadProducts),
		staleTime: 60_000,
	})
	const { control, register, handleSubmit, watch, formState: { errors } } = useForm<OrderFormValues>({
		resolver: zodResolver(orderSchema),
		defaultValues: { items: [{ productId: "", quantity: 1 }] },
	})
	const { fields, append, remove } = useFieldArray({ control, name: "items" })
	const selectedItems = watch("items")

	const mutation = useMutation({
		mutationFn: (values: OrderFormValues) => {
			if (!token) throw new Error("Authentication required")
			return createOrder(token, values)
		},
		onSuccess: async () => {
			if (tenantId) await queryClient.invalidateQueries({ queryKey: orderKeys.all(tenantId) })
			await queryClient.invalidateQueries({ queryKey: ["inventory"] })
			await queryClient.invalidateQueries({ queryKey: ["erp-dashboard"] })
			setServerError(null)
			onCreated()
		},
		onError: (cause) => {
			if (cause instanceof ApiError && cause.status === 403) {
				setServerError("Your session is not authorized to create orders.")
				return
			}
			setServerError(cause instanceof Error ? cause.message : "Unable to create order")
		},
	})

	if (!canReadProducts) return <UnavailableState title="Product access is required" description="The Orders backend accepts product IDs, so product.read access is required to choose tenant-scoped products safely." />
	if (productsQuery.isPending) return <div className="space-y-3"><div className="h-11 animate-pulse rounded-xl bg-[var(--muted)]" /><div className="h-11 animate-pulse rounded-xl bg-[var(--muted)]" /></div>
	if (productsQuery.isError) return <UnavailableState title="Unable to load products" description={productsQuery.error instanceof ApiError && productsQuery.error.status === 403 ? "Your session cannot read products required for order creation." : "The product API could not be reached, so an order cannot be created safely."} />
	if (!productsQuery.data?.length) return <EmptyState title="Products are required" description="Create a product before creating an order." />

	const products = productsQuery.data
	const previewTotal = selectedItems.reduce((total, item) => {
		const product = products.find((candidate) => candidate.id === item.productId)
		return total + (product?.price ?? 0) * (Number.isFinite(item.quantity) ? item.quantity : 0)
	}, 0)

	return (
		<form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-5" noValidate>
			<div className="space-y-3">
				{fields.map((field, index) => (
					<div key={field.id} className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3 sm:grid-cols-[1fr_120px_auto] sm:items-end">
						<label className="block text-sm font-medium text-[var(--foreground)]">Product<select {...register(`items.${index}.productId`)} aria-label={`Product ${index + 1}`} className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"><option value="">Select product</option>{products.map((product: Product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</option>)}</select>{errors.items?.[index]?.productId && <span className="mt-1 block text-xs text-[var(--danger)]">{errors.items[index]?.productId?.message}</span>}</label>
						<label className="block text-sm font-medium text-[var(--foreground)]">Quantity<input {...register(`items.${index}.quantity`, { valueAsNumber: true })} type="number" min="1" step="1" aria-label={`Quantity for product ${index + 1}`} className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]" />{errors.items?.[index]?.quantity && <span className="mt-1 block text-xs text-[var(--danger)]">{errors.items[index]?.quantity?.message}</span>}</label>
						{fields.length > 1 ? <button type="button" onClick={() => remove(index)} className="h-11 rounded-xl border border-[var(--border)] px-3 text-sm font-semibold text-[var(--muted-foreground)] hover:border-[var(--danger)] hover:text-[var(--danger)]">Remove</button> : null}
					</div>
				))}
			</div>
			<button type="button" onClick={() => append({ productId: "", quantity: 1 })} className="text-sm font-semibold text-[var(--primary)] hover:underline">+ Add another product</button>
			<div className="rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-4"><div className="flex items-center justify-between gap-4"><span className="text-sm text-[var(--muted-foreground)]">Preview total</span><strong className="text-lg text-[var(--foreground)]">{formatAmount(previewTotal)}</strong></div><p className="mt-2 text-xs text-[var(--muted-foreground)]">The backend recalculates product prices and the authoritative order total.</p></div>
			{errors.items?.message && <p role="alert" className="text-sm text-[var(--danger)]">{errors.items.message}</p>}
			{serverError && <p role="alert" className="text-sm text-[var(--danger)]">{serverError}</p>}
			<Button type="submit" disabled={mutation.isPending || !token}>{mutation.isPending ? "Creating order..." : "Create order"}</Button>
		</form>
	)
}