"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"

import { EmptyState, SectionHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth.store"
import { getProducts, productKeys } from "@/features/erp/products/api/queries"
import { ProductForm } from "@/features/erp/products/components/product-form"

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(price)
}

export function ProductWorkspace() {
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const canRead = hasPermission(session, "product.read")
  const tenantId = session?.tenantId
  const canCreate = hasPermission(session, "product.create")
  const query = useQuery({
    queryKey: tenantId ? productKeys.all(tenantId) : ["products", "unauthenticated"],
    queryFn: () => getProducts(token as string),
    enabled: Boolean(token && tenantId && canRead),
    staleTime: 60_000,
  })

  if (!canRead) return <UnavailableState title="Product access is restricted" description="Your current tenant session does not include the product.read permission." />
  if (query.isPending) return <div className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-6"><div className="h-12 animate-pulse rounded-xl bg-[var(--muted)]" /><div className="mt-3 h-12 animate-pulse rounded-xl bg-[var(--muted)]" /></div>
  if (query.isError) {
    const message = query.error instanceof ApiError && query.error.status === 403 ? "Your session is not authorized to view products." : "The product API could not be reached. No placeholder records are shown."
    return <UnavailableState title="Unable to load products" description={message} />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-sm font-semibold text-[var(--foreground)]">Catalog records</p><p className="mt-1 text-sm text-[var(--muted-foreground)]">Tenant-scoped products returned by the backend.</p></div>
        {canCreate ? <button type="button" onClick={() => setIsCreateOpen((open) => !open)} className="rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">{isCreateOpen ? "Close form" : "New product"}</button> : <StatusBadge tone="neutral">Read only</StatusBadge>}
      </div>
      {isCreateOpen && canCreate ? <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5"><SectionHeader eyebrow="Catalog action" title="Create product" /><ProductForm onCreated={() => setIsCreateOpen(false)} /></section> : null}
      {!query.data?.length ? <EmptyState title="No products yet" description="This tenant has no product records available from the API." /> : <section className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--panel)]"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-[var(--muted)] text-[var(--muted-foreground)]"><tr>{["Product", "SKU", "Price", "Inventory link", "Status"].map((heading) => <th key={heading} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em]">{heading}</th>)}</tr></thead><tbody>{query.data.map((product) => <tr key={product.id} className="border-t border-[var(--border)] transition-colors hover:bg-[var(--muted)]/50"><td className="px-4 py-4"><Link href={`/app/products/${product.id}`} className="font-semibold text-[var(--foreground)] hover:text-[var(--primary)]">{product.name}</Link>{product.description ? <p className="mt-1 max-w-sm truncate text-xs text-[var(--muted-foreground)]">{product.description}</p> : null}</td><td className="px-4 py-4 text-[var(--muted-foreground)]">{product.sku ?? "-"}</td><td className="px-4 py-4 font-medium text-[var(--foreground)]">{formatPrice(product.price)}</td><td className="px-4 py-4 text-[var(--muted-foreground)]">{product.inventoryItemId ? "Linked" : "Not linked"}</td><td className="px-4 py-4"><StatusBadge tone={product.isActive === false ? "neutral" : "success"}>{product.isActive === false ? "Inactive" : "Active"}</StatusBadge></td></tr>)}</tbody></table></div></section>}
      <p className="text-xs text-[var(--muted-foreground)]">Search, pagination, update, and deletion are unavailable because the current Products backend does not expose those contracts.</p>
    </div>
  )
}