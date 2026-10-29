"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  EmptyState,
  SectionHeader,
  StatusBadge,
  UnavailableState,
} from "@/components/data-display/states";
import { ApiError } from "@/lib/api/client";
import {
  getIngredients,
  ingredientKeys,
} from "@/features/erp/ingredients/api/queries";
import { getProducts, productKeys } from "@/features/erp/products/api/queries";
import { RecipeForm } from "@/features/erp/recipes/components/recipe-form";
import {
  getRecipes,
  getRecipeByProduct,
  recipeKeys,
} from "@/features/erp/recipes/api/queries";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";

export function RecipeWorkspace() {
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const tenantId = session?.tenantId;
  const canRead = hasPermission(session, "recipe.read");
  const canCreate = hasPermission(session, "recipe.create");
  const canReadProducts = hasPermission(session, "product.read");
  const canReadIngredients = hasPermission(session, "ingredient.read");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [recipePage, setRecipePage] = useState(1);
  const [recipeSearchDraft, setRecipeSearchDraft] = useState("");
  const [recipeSearch, setRecipeSearch] = useState("");

  const productsQuery = useQuery({
    queryKey: tenantId
      ? productKeys.all(tenantId)
      : ["products", "unauthenticated"],
    queryFn: () => getProducts(token as string),
    enabled: Boolean(token && tenantId && canRead && canReadProducts),
    staleTime: 60_000,
  });
  const ingredientsQuery = useQuery({
    queryKey: tenantId
      ? ingredientKeys.options(tenantId)
      : ["ingredients", "unauthenticated"],
    queryFn: () => getIngredients(token as string),
    enabled: Boolean(token && tenantId && canRead && canReadIngredients),
    staleTime: 60_000,
  });
  const recipeQuery = useQuery({
    queryKey:
      tenantId && selectedProductId
        ? recipeKeys.byProduct(tenantId, selectedProductId)
        : ["recipes", "unselected"],
    queryFn: () => getRecipeByProduct(token as string, selectedProductId),
    enabled: Boolean(token && tenantId && canRead && selectedProductId),
    staleTime: 60_000,
  });
  const recipesQuery = useQuery({
    queryKey: tenantId
      ? recipeKeys.list(tenantId, {
          page: recipePage,
          limit: 20,
          ...(recipeSearch ? { search: recipeSearch } : {}),
        })
      : ["recipes", "unauthenticated", "list"],
    queryFn: () =>
      getRecipes(token as string, {
        page: recipePage,
        limit: 20,
        ...(recipeSearch ? { search: recipeSearch } : {}),
      }),
    enabled: Boolean(token && tenantId && canRead),
    staleTime: 30_000,
  });

  if (!canRead)
    return (
      <UnavailableState
        title="Recipe access is restricted"
        description="Your current tenant session does not include the recipe.read permission."
      />
    );
  if (!canReadProducts || !canReadIngredients)
    return (
      <UnavailableState
        title="Recipe dependencies are restricted"
        description="Recipe composition requires access to both products and ingredients. The current session does not include all required read permissions."
      />
    );
  if (productsQuery.isPending || ingredientsQuery.isPending)
    return (
      <div className="space-y-3">
        <div className="h-20 animate-pulse rounded-3xl bg-muted" />
        <div className="h-64 animate-pulse rounded-3xl bg-muted" />
      </div>
    );
  if (productsQuery.isError || ingredientsQuery.isError) {
    const forbidden = [productsQuery.error, ingredientsQuery.error].some(
      (error) => error instanceof ApiError && error.status === 403,
    );
    return (
      <UnavailableState
        title="Unable to load recipe dependencies"
        description={
          forbidden
            ? "Your session is not authorized to read the products or ingredients required by Recipes."
            : "The Products or Ingredients API could not be reached. No recipe data is shown."
        }
      />
    );
  }

  const products = productsQuery.data ?? [];
  const ingredients = ingredientsQuery.data ?? [];
  const selectedProduct = products.find(
    (product) => product.id === selectedProductId,
  );
  const recipe = recipeQuery.data;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <label className="block max-w-xl flex-1 text-sm font-medium text-foreground">
            Product
            <select
              value={selectedProductId}
              onChange={(event) => {
                setSelectedProductId(event.target.value);
                setIsCreateOpen(false);
              }}
              className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring"
              aria-label="Select product to inspect its recipe"
            >
              <option value="">Select a product to inspect its recipe</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                  {product.sku ? ` (${product.sku})` : ""}
                </option>
              ))}
            </select>
          </label>
          {canCreate ? (
            <button
              type="button"
              disabled={!products.length || !ingredients.length}
              onClick={() => setIsCreateOpen((open) => !open)}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCreateOpen ? "Close form" : "New recipe"}
            </button>
          ) : (
            <StatusBadge tone="neutral">Read only</StatusBadge>
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Browse and search the tenant recipe catalog, then load a selected
          recipe composition by product.
        </p>
      </section>

      <section className="rounded-3xl border border-border bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Recipe catalog
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Browse recipes registered for products in this tenant.
            </p>
          </div>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setRecipePage(1);
              setRecipeSearch(recipeSearchDraft.trim());
            }}
          >
            <label className="sr-only" htmlFor="recipe-search">
              Search recipes
            </label>
            <input
              id="recipe-search"
              value={recipeSearchDraft}
              onChange={(event) => setRecipeSearchDraft(event.target.value)}
              maxLength={100}
              placeholder="Search product or SKU"
              className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
            />
            <button
              type="submit"
              className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-white"
            >
              Search
            </button>
          </form>
        </div>
        {recipesQuery.isPending ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Loading recipe catalog...
          </p>
        ) : recipesQuery.isError ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            Unable to load the tenant-scoped recipe catalog.
          </p>
        ) : !recipesQuery.data?.data.length ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {recipeSearch
              ? "No recipes match this search."
              : "No recipes have been created for this tenant yet."}
          </p>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    {["Product", "SKU", "Ingredients", "Created", "Action"].map(
                      (heading) => (
                        <th
                          key={heading}
                          className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em]"
                        >
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {recipesQuery.data.data.map((entry) => (
                    <tr key={entry.id} className="border-t border-border">
                      <td className="px-4 py-3 font-medium">
                        {entry.Product.name}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {entry.Product.sku ?? "-"}
                      </td>
                      <td className="px-4 py-3">{entry._count.RecipeItem}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProductId(entry.productId);
                            setIsCreateOpen(false);
                          }}
                          className="font-semibold text-primary hover:underline"
                        >
                          View recipe
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">
                {recipesQuery.data.pagination.total} recipe
                {recipesQuery.data.pagination.total === 1 ? "" : "s"} · Page{" "}
                {recipesQuery.data.pagination.page} of{" "}
                {Math.max(recipesQuery.data.pagination.totalPages, 1)}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={recipePage <= 1 || recipesQuery.isFetching}
                  onClick={() => setRecipePage((page) => page - 1)}
                  className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={
                    recipePage >= recipesQuery.data.pagination.totalPages ||
                    recipesQuery.isFetching
                  }
                  onClick={() => setRecipePage((page) => page + 1)}
                  className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {isCreateOpen && canCreate ? (
        <section className="rounded-3xl border border-border bg-card p-5">
          <SectionHeader eyebrow="Composition action" title="Create recipe" />
          <RecipeForm
            products={products}
            ingredients={ingredients}
            onCreated={(productId) => {
              setSelectedProductId(productId);
              setIsCreateOpen(false);
            }}
          />
        </section>
      ) : null}

      {!products.length ? (
        <EmptyState
          title="No products available"
          description="Recipes require a product, and the Products API returned no records for this tenant."
        />
      ) : null}
      {selectedProductId && recipeQuery.isPending ? (
        <div className="h-56 animate-pulse rounded-3xl bg-muted" />
      ) : null}
      {selectedProductId && recipeQuery.isError ? (
        <UnavailableState
          title="Unable to load recipe"
          description={
            recipeQuery.error instanceof ApiError &&
            recipeQuery.error.status === 403
              ? "Your session is not authorized to read this product recipe."
              : "The recipe lookup API could not be reached."
          }
        />
      ) : null}
      {selectedProductId &&
      !recipeQuery.isPending &&
      !recipeQuery.isError &&
      !recipe ? (
        <EmptyState
          title="No recipe for this product"
          description={
            canCreate
              ? "This product has no recipe yet. Create one using the supported composition form."
              : "This product has no recipe returned by the backend."
          }
        />
      ) : null}
      {recipe ? (
        <section className="rounded-3xl border border-border bg-card p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
                Recipe composition
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">
                {recipe.Product.name}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Recipe {recipe.id} · Created{" "}
                {new Date(recipe.createdAt).toLocaleDateString()}
              </p>
            </div>
            <StatusBadge tone="success">Backend record</StatusBadge>
          </div>
          <div className="mt-5 overflow-hidden rounded-2xl border border-border">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    {["Ingredient", "Unit", "Quantity"].map((heading) => (
                      <th
                        key={heading}
                        className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em]"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recipe.RecipeItem.map((item) => (
                    <tr key={item.id} className="border-t border-border">
                      <td className="px-4 py-4 font-medium text-foreground">
                        {item.InventoryItem.name}
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {item.InventoryItem.unit ?? "—"}
                      </td>
                      <td className="px-4 py-4 font-medium text-foreground">
                        {item.quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Recipe changes, inventory consumption, and fulfillment remain
            backend-owned. Update and delete controls are unavailable because
            those endpoints do not exist.
          </p>
        </section>
      ) : null}
      {selectedProduct ? (
        <p className="text-xs text-muted-foreground">
          Selected product: {selectedProduct.name}. Recipe lookup is
          tenant-scoped by the authenticated session.
        </p>
      ) : null}
    </div>
  );
}
