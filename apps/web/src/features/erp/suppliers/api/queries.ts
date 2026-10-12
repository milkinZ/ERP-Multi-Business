import { apiRequest } from "@/lib/api/client"

export type Supplier = {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  tenantId: string
  createdAt: string
}

export type SupplierInput = {
  name: string
  phone?: string
  email?: string
  address?: string
}

export type UpdateSupplierInput = Partial<SupplierInput>

export const supplierKeys = {
  all: (tenantId: string) => ["suppliers", tenantId] as const,
  detail: (tenantId: string, supplierId: string) => ["suppliers", tenantId, supplierId] as const,
}

type SupplierAggregateResponse = { props: Supplier }

function normalizeSupplier(value: Supplier | SupplierAggregateResponse): Supplier {
  return "props" in value ? value.props : value
}

export function getSuppliers(accessToken: string) {
  return apiRequest<Supplier[]>("/suppliers", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

export async function getSupplier(accessToken: string, supplierId: string) {
  const response = await apiRequest<Supplier | SupplierAggregateResponse>(`/suppliers/${encodeURIComponent(supplierId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  return normalizeSupplier(response)
}

export async function createSupplier(accessToken: string, input: SupplierInput) {
  const response = await apiRequest<Supplier | SupplierAggregateResponse>("/suppliers", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  })
  return normalizeSupplier(response)
}

export async function updateSupplier(accessToken: string, supplierId: string, input: UpdateSupplierInput) {
  const response = await apiRequest<Supplier | SupplierAggregateResponse>(`/suppliers/${encodeURIComponent(supplierId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  })
  return normalizeSupplier(response)
}

export function deleteSupplier(accessToken: string, supplierId: string) {
  return apiRequest<{ success: boolean }>(`/suppliers/${encodeURIComponent(supplierId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}
