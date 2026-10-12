import { apiRequest } from "@/lib/api/client"

export type Product = {
	id: string
	name: string
	description?: string | null
	sku?: string | null
	price: number
	isActive?: boolean
	tenantId?: string
	outletId?: string | null
	inventoryItemId?: string | null
	createdAt?: string
}

export type CreateProductInput = {
	name: string
	description?: string
	sku?: string
	price: number
}

export const productKeys = {
	all: (tenantId: string) => ["products", tenantId] as const,
	detail: (tenantId: string, productId: string) => ["products", tenantId, productId] as const,
}

export function getProducts(accessToken: string) {
	return apiRequest<Product[]>("/products", { headers: { Authorization: `Bearer ${accessToken}` } })
}

export function getProduct(accessToken: string, productId: string) {
	return apiRequest<Product>(`/products/${encodeURIComponent(productId)}`, { headers: { Authorization: `Bearer ${accessToken}` } })
}

export function createProduct(accessToken: string, input: CreateProductInput) {
	return apiRequest<Product>("/products", {
		method: "POST",
		headers: { Authorization: `Bearer ${accessToken}` },
		body: JSON.stringify(input),
	})
}
