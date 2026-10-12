"use client"

import React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"

import { ApiError } from "@/lib/api/client"
import { PageHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { getIngredient, ingredientKeys } from "@/features/erp/ingredients/api/queries"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth.store"

export default function IngredientDetailPage() {
  const { ingredientId } = useParams<{ ingredientId: string }>()
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const tenantId = session?.tenantId
  const canRead = hasPermission(session, "ingredient.read")

  const query = useQuery({
    queryKey: tenantId ? ingredientKeys.detail(tenantId, ingredientId) : ["ingredients", "unauthenticated", ingredientId],
    queryFn: () => getIngredient(token as string, ingredientId),
    enabled: Boolean(token && tenantId && canRead && ingredientId),
    staleTime: 60_000,
  })

  if (!canRead) return <UnavailableState title="Ingredient access is restricted" description="Your current tenant session does not include the ingredient.read permission." />
  if (query.isPending) return <div className="h-48 animate-pulse rounded-3xl border border-[var(--border)] bg-[var(--panel)]" />
  if (query.isError) {
    const message = query.error instanceof ApiError && query.error.status === 404 ? "This ingredient does not exist in the active tenant." : "The ingredient detail API could not be reached."
    return <UnavailableState title="Unable to load ingredient" description={message} />
  }
  if (!query.data) return <UnavailableState title="Ingredient not found" description="The API returned no ingredient for this tenant-scoped route." />

  const ingredient = query.data

  return (
    <>
      <PageHeader eyebrow="Tenant application / master data" title={ingredient.name} description="Ingredient details returned by the backend, including the inventory item created and linked by the ingredient transaction." actions={<StatusBadge tone="info">{ingredient.unit}</StatusBadge>} />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5"><p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Name</p><p className="mt-2 font-medium">{ingredient.name}</p></div>
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5"><p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Unit</p><p className="mt-2 font-medium">{ingredient.unit}</p></div>
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5"><p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Ingredient ID</p><p className="mt-2 break-all font-medium">{ingredient.id}</p></div>
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5"><p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Tenant</p><p className="mt-2 break-all font-medium">{ingredient.tenantId}</p></div>
      </section>
      <section className="mt-6 rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5"><p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Linked inventory item</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><div><p className="text-sm font-medium">{ingredient.InventoryItem.name}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">Inventory ID: {ingredient.inventoryItemId}</p></div><div><p className="text-sm font-medium">{ingredient.InventoryItem.code}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">Type: {ingredient.InventoryItem.type} · {ingredient.InventoryItem.isActive ? "Active" : "Inactive"}</p></div></div><p className="mt-4 text-sm text-[var(--muted-foreground)]">Stock quantities and movement history remain owned by the Inventory module and are not returned by the Ingredients API.</p></section>
      <section className="mt-6 rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5"><p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Recipe usage</p><p className="mt-3 text-sm text-[var(--muted-foreground)]">Recipe usage is not exposed through an ingredient-specific backend endpoint. The current Recipes API only looks up a recipe by product.</p></section>
      <Link href="/app/ingredients" className="mt-6 inline-flex text-sm font-semibold text-[var(--primary)] hover:underline">Back to ingredients</Link>
    </>
  )
}
