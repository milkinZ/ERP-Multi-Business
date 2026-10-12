"use client"

import React, { useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { EmptyState, SectionHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { getIngredients, ingredientKeys } from "@/features/erp/ingredients/api/queries"
import { getProducts, productKeys } from "@/features/erp/products/api/queries"
import { RecipeForm } from "@/features/erp/recipes/components/recipe-form"
import { getRecipeByProduct, recipeKeys } from "@/features/erp/recipes/api/queries"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth.store"

export function RecipeWorkspace() {
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const tenantId = session?.tenantId
  const canRead = hasPermission(session, "recipe.read")
  const canCreate = hasPermission(session, "recipe.create")
  const canReadProducts = hasPermission(session, "product.read")
  const canReadIngredients = hasPermission(session, "ingredient.read")
  const [selectedProductId, setSelectedProductId] = useState("")
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  const productsQuery = useQuery({
    queryKey: tenantId ? productKeys.all(tenantId) : ["products", "unauthenticated"],
    queryFn: () => getProducts(token as string),
    enabled: Boolean(token && tenantId && canRead && canReadProducts),
    staleTime: 60_000,
  })
  const ingredientsQuery = useQuery({
    queryKey: tenantId ? ingredientKeys.all(tenantId) : ["ingredients", "unauthenticated"],
    queryFn: () => getIngredients(token as string),
    enabled: Boolean(token && tenantId && canRead && canReadIngredients),
    staleTime: 60_000,
  })
  const recipeQuery = useQuery({
    queryKey: tenantId && selectedProductId ? recipeKeys.byProduct(tenantId, selectedProductId) : ["recipes", "unselected"],
    queryFn: () => getRecipeByProduct(token as string, selectedProductId),
    enabled: Boolean(token && tenantId && canRead && selectedProductId),
    staleTime: 60_000,
  })

  if (!canRead) return <UnavailableState title="Recipe access is restricted" description="Your current tenant session does not include the recipe.read permission." />
  if (!canReadProducts || !canReadIngredients) return <UnavailableState title="Recipe dependencies are restricted" description="Recipe composition requires access to both products and ingredients. The current session does not include all required read permissions." />
  if (productsQuery.isPending || ingredientsQuery.isPending) return <div className="space-y-3"><div className="h-20 animate-pulse rounded-3xl bg-muted" /><div className="h-64 animate-pulse rounded-3xl bg-muted" /></div>
  if (productsQuery.isError || ingredientsQuery.isError) {
    const forbidden = [productsQuery.error, ingredientsQuery.error].some((error) => error instanceof ApiError && error.status === 403)
    return <UnavailableState title="Unable to load recipe dependencies" description={forbidden ? "Your session is not authorized to read the products or ingredients required by Recipes." : "The Products or Ingredients API could not be reached. No recipe data is shown."} />
  }

  const products = productsQuery.data ?? []
  const ingredients = ingredientsQuery.data ?? []
  const selectedProduct = products.find((product) => product.id === selectedProductId)
  const recipe = recipeQuery.data

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <label className="block max-w-xl flex-1 text-sm font-medium text-foreground">
            Product
            <select value={selectedProductId} onChange={(event) => { setSelectedProductId(event.target.value); setIsCreateOpen(false) }} className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring" aria-label="Select product to inspect its recipe">
              <option value="">Select a product to inspect its recipe</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` (${product.sku})` : ""}</option>)}
            </select>
          </label>
          {canCreate ? <button type="button" disabled={!products.length || !ingredients.length} onClick={() => setIsCreateOpen((open) => !open)} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">{isCreateOpen ? "Close form" : "New recipe"}</button> : <StatusBadge tone="neutral">Read only</StatusBadge>}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">The backend exposes recipe lookup by product, so recipe data is loaded only for the selected product.</p>
      </section>

      {isCreateOpen && canCreate ? <section className="rounded-3xl border border-border bg-card p-5"><SectionHeader eyebrow="Composition action" title="Create recipe" /><RecipeForm products={products} ingredients={ingredients} onCreated={(productId) => { setSelectedProductId(productId); setIsCreateOpen(false) }} /></section> : null}

      {!products.length ? <EmptyState title="No products available" description="Recipes require a product, and the Products API returned no records for this tenant." /> : null}
      {selectedProductId && recipeQuery.isPending ? <div className="h-56 animate-pulse rounded-3xl bg-muted" /> : null}
      {selectedProductId && recipeQuery.isError ? <UnavailableState title="Unable to load recipe" description={recipeQuery.error instanceof ApiError && recipeQuery.error.status === 403 ? "Your session is not authorized to read this product recipe." : "The recipe lookup API could not be reached."} /> : null}
      {selectedProductId && !recipeQuery.isPending && !recipeQuery.isError && !recipe ? <EmptyState title="No recipe for this product" description={canCreate ? "This product has no recipe yet. Create one using the supported composition form." : "This product has no recipe returned by the backend."} /> : null}
      {recipe ? <section className="rounded-3xl border border-border bg-card p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Recipe composition</p><h2 className="mt-2 text-2xl font-semibold text-foreground">{recipe.Product.name}</h2><p className="mt-1 text-xs text-muted-foreground">Recipe {recipe.id} · Created {new Date(recipe.createdAt).toLocaleDateString()}</p></div><StatusBadge tone="success">Backend record</StatusBadge></div><div className="mt-5 overflow-hidden rounded-2xl border border-border"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-muted text-muted-foreground"><tr>{["Ingredient", "Unit", "Quantity"].map((heading) => <th key={heading} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em]">{heading}</th>)}</tr></thead><tbody>{recipe.RecipeItem.map((item) => <tr key={item.id} className="border-t border-border"><td className="px-4 py-4 font-medium text-foreground">{item.Ingredient.name}</td><td className="px-4 py-4 text-muted-foreground">{item.Ingredient.unit}</td><td className="px-4 py-4 font-medium text-foreground">{item.quantity}</td></tr>)}</tbody></table></div></div><p className="mt-4 text-sm text-muted-foreground">Recipe changes, inventory consumption, and fulfillment remain backend-owned. Update and delete controls are unavailable because those endpoints do not exist.</p></section> : null}
      {selectedProduct ? <p className="text-xs text-muted-foreground">Selected product: {selectedProduct.name}. Recipe lookup is tenant-scoped by the authenticated session.</p> : null}
    </div>
  )
}
