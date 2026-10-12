"use client"

import React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"

import { PageHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { hasPermission } from "@/lib/permissions"
import { getProduct, productKeys } from "@/features/erp/products/api/queries"
import { useAuthStore } from "@/stores/auth.store"

export default function ProductDetailPage() {
  const params = useParams<{ productId: string }>()
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const tenantId = session?.tenantId
  const canRead = hasPermission(session, "product.read")
  const query = useQuery({
    queryKey: tenantId ? productKeys.detail(tenantId, params.productId) : ["products", "unauthenticated", params.productId],
    queryFn: () => getProduct(token as string, params.productId),
    enabled: Boolean(token && tenantId && canRead && params.productId),
    staleTime: 60_000,
  })

  if (!canRead) return <UnavailableState title="Product access is restricted" description="Your current tenant session does not include the product.read permission." />
  if (query.isPending) return <div className="h-48 animate-pulse rounded-3xl border border-border bg-[var(--panel)]" />
  if (query.isError) return <UnavailableState title="Unable to load product" description={query.error instanceof ApiError && query.error.status === 404 ? "This product was not found in the current tenant." : "The product detail API could not be reached."} />
  if (!query.data) return <UnavailableState title="Product not found" description="The API returned no product record for this route." />

  const product = query.data
  return <><PageHeader eyebrow="Tenant application / catalog" title={product.name} description="Product detail returned by the tenant-scoped backend API." actions={<StatusBadge tone={product.isActive === false ? "neutral" : "success"}>{product.isActive === false ? "Inactive" : "Active"}</StatusBadge>} /><section className="grid gap-4 md:grid-cols-2"><div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5"><p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Product ID</p><p className="mt-2 break-all font-medium">{product.id}</p></div><div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5"><p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Price</p><p className="mt-2 text-2xl font-semibold">{product.price}</p></div><div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5"><p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">SKU</p><p className="mt-2 font-medium">{product.sku ?? "-"}</p></div><div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5"><p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Inventory item</p><p className="mt-2 font-medium">{product.inventoryItemId ?? "Not linked"}</p></div></section><section className="mt-6 rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5"><p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Description</p><p className="mt-3 text-sm leading-7 text-[var(--muted-foreground)]">{product.description || "No description was returned."}</p></section><Link href="/app/products" className="mt-6 inline-flex text-sm font-semibold text-[var(--primary)] hover:underline">Back to products</Link></>
}