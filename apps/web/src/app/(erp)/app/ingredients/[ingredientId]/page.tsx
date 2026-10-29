"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { ApiError } from "@/lib/api/client";
import {
  PageHeader,
  StatusBadge,
  UnavailableState,
} from "@/components/data-display/states";
import {
  getIngredient,
  ingredientKeys,
} from "@/features/erp/ingredients/api/queries";
import { IngredientEditForm } from "@/features/erp/ingredients/components/ingredient-edit-form";
import {
  getInventoryHistoryForItem,
  getInventoryStockBalances,
  inventoryKeys,
} from "@/features/erp/inventory/api/queries";
import {
  getIngredientRecipeUsage,
  recipeKeys,
} from "@/features/erp/recipes/api/queries";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";

export default function IngredientDetailPage() {
  const { ingredientId } = useParams<{ ingredientId: string }>();
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const tenantId = session?.tenantId;
  const canRead = hasPermission(session, "ingredient.read");
  const canUpdate = hasPermission(session, "ingredient.update");
  const canDelete = hasPermission(session, "ingredient.delete");
  const canReadInventory = hasPermission(session, "inventory.read");
  const canReadRecipes = hasPermission(session, "recipe.read");
  const [movementPage, setMovementPage] = useState(1);
  const [usagePage, setUsagePage] = useState(1);

  const query = useQuery({
    queryKey: tenantId
      ? ingredientKeys.detail(tenantId, ingredientId)
      : ["ingredients", "unauthenticated", ingredientId],
    queryFn: () => getIngredient(token as string, ingredientId),
    enabled: Boolean(token && tenantId && canRead && ingredientId),
    staleTime: 60_000,
  });
  const stockQuery = useQuery({
    queryKey: tenantId
      ? inventoryKeys.stockBalances(tenantId, ingredientId)
      : ["inventory-stock-balances", "unauthenticated", ingredientId],
    queryFn: () => getInventoryStockBalances(token as string, ingredientId),
    enabled: Boolean(
      token && tenantId && canRead && canReadInventory && ingredientId,
    ),
    staleTime: 15_000,
  });
  const movementQuery = useQuery({
    queryKey: tenantId
      ? inventoryKeys.itemHistory(tenantId, ingredientId, {
          page: movementPage,
          limit: 10,
        })
      : ["inventory-history", "unauthenticated", ingredientId, movementPage],
    queryFn: () =>
      getInventoryHistoryForItem(token as string, ingredientId, {
        page: movementPage,
        limit: 10,
      }),
    enabled: Boolean(
      token && tenantId && canRead && canReadInventory && ingredientId,
    ),
    staleTime: 15_000,
  });
  const usageQuery = useQuery({
    queryKey: tenantId
      ? recipeKeys.byInventoryItem(tenantId, ingredientId, usagePage)
      : ["recipes", "unauthenticated", "ingredient", ingredientId, usagePage],
    queryFn: () =>
      getIngredientRecipeUsage(token as string, ingredientId, {
        page: usagePage,
        limit: 10,
      }),
    enabled: Boolean(
      token && tenantId && canRead && canReadRecipes && ingredientId,
    ),
    staleTime: 30_000,
  });

  if (!canRead)
    return (
      <UnavailableState
        title="Ingredient access is restricted"
        description="Your current tenant session does not include the ingredient.read permission."
      />
    );
  if (query.isPending)
    return (
      <div className="h-48 animate-pulse rounded-3xl border border-[var(--border)] bg-[var(--panel)]" />
    );
  if (query.isError) {
    const message =
      query.error instanceof ApiError && query.error.status === 404
        ? "This ingredient does not exist in the active tenant."
        : "The ingredient detail API could not be reached.";
    return (
      <UnavailableState
        title="Unable to load ingredient"
        description={message}
      />
    );
  }
  if (!query.data)
    return (
      <UnavailableState
        title="Ingredient not found"
        description="The API returned no ingredient for this tenant-scoped route."
      />
    );

  const ingredient = query.data;

  return (
    <>
      <PageHeader
        eyebrow="Tenant application / master data"
        title={ingredient.name}
        description="Ingredient details returned by the backend, including the inventory item created and linked by the ingredient transaction."
        actions={<StatusBadge tone="info">{ingredient.unit}</StatusBadge>}
      />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            Name
          </p>
          <p className="mt-2 font-medium">{ingredient.name}</p>
        </div>
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            Unit
          </p>
          <p className="mt-2 font-medium">{ingredient.unit}</p>
        </div>
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            Ingredient ID
          </p>
          <p className="mt-2 break-all font-medium">{ingredient.id}</p>
        </div>
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            Tenant
          </p>
          <p className="mt-2 break-all font-medium">{ingredient.tenantId}</p>
        </div>
      </section>
      <section className="mt-6 rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          Linked inventory item
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium">
              {ingredient.InventoryItem.name}
            </p>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Inventory ID: {ingredient.inventoryItemId}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              {ingredient.InventoryItem.code}
            </p>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Type: {ingredient.InventoryItem.type} ·{" "}
              {ingredient.InventoryItem.isActive ? "Active" : "Inactive"}
            </p>
          </div>
        </div>
      </section>
      <section className="mt-6 rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            Ingredient status
          </p>
          <StatusBadge
            tone={ingredient.InventoryItem.isActive ? "success" : "neutral"}
          >
            {ingredient.InventoryItem.isActive ? "Active" : "Inactive"}
          </StatusBadge>
        </div>
        {canUpdate || canDelete ? (
          <IngredientEditForm
            key={ingredient.id}
            ingredient={ingredient}
            canUpdate={canUpdate}
            canDelete={canDelete}
          />
        ) : (
          <p className="mt-3 text-sm text-[var(--muted-foreground)]">
            Editing and deactivation require the ingredient.update permission.
          </p>
        )}
      </section>
      <section className="mt-6 rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          Stock balances
        </p>
        {!canReadInventory ? (
          <p className="mt-3 text-sm text-[var(--muted-foreground)]">
            Stock details require the inventory.read permission.
          </p>
        ) : stockQuery.isPending ? (
          <p className="mt-3 text-sm text-[var(--muted-foreground)]">
            Loading stock balances...
          </p>
        ) : stockQuery.isError ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Unable to load inventory stock balances.
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm font-medium">
              Total: {stockQuery.data?.totalQuantity ?? 0} {ingredient.unit}
            </p>
            {!stockQuery.data?.balances.length ? (
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                No stock balances recorded.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-[var(--border)]">
                {stockQuery.data.balances.map((balance) => (
                  <div
                    key={balance.warehouseId ?? "unassigned"}
                    className="flex justify-between gap-3 py-2 text-sm"
                  >
                    <span>{balance.warehouse?.name ?? "Unassigned"}</span>
                    <span className="font-medium">
                      {balance.quantity} {ingredient.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
      <section className="mt-6 rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          Movement history
        </p>
        {!canReadInventory ? (
          <p className="mt-3 text-sm text-[var(--muted-foreground)]">
            Movement history requires the inventory.read permission.
          </p>
        ) : movementQuery.isPending ? (
          <p className="mt-3 text-sm text-[var(--muted-foreground)]">
            Loading movement history...
          </p>
        ) : movementQuery.isError ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Unable to load ingredient movement history.
          </p>
        ) : (
          <>
            {!movementQuery.data?.data.length ? (
              <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                No movement history recorded for this ingredient.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {movementQuery.data.data.map((movement) => (
                  <div
                    key={movement.id}
                    className="flex flex-wrap justify-between gap-2 rounded-xl border border-[var(--border)] p-3 text-sm"
                  >
                    <span>
                      {movement.type} · {movement.quantity} {ingredient.unit} ·{" "}
                      {movement.Warehouse?.name ?? "Unassigned"}
                    </span>
                    <span className="text-[var(--muted-foreground)]">
                      {new Date(movement.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {movementQuery.data &&
            movementQuery.data.pagination.totalPages > 1 ? (
              <div className="mt-3 flex items-center justify-between text-sm">
                <span>
                  Page {movementPage} of{" "}
                  {movementQuery.data.pagination.totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={movementPage <= 1 || movementQuery.isFetching}
                    onClick={() => setMovementPage((page) => page - 1)}
                    className="rounded-lg border border-[var(--border)] px-3 py-1 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={
                      movementPage >=
                        movementQuery.data.pagination.totalPages ||
                      movementQuery.isFetching
                    }
                    onClick={() => setMovementPage((page) => page + 1)}
                    className="rounded-lg border border-[var(--border)] px-3 py-1 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>
      <section className="mt-6 rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          Recipe usage
        </p>
        {!canReadRecipes ? (
          <p className="mt-3 text-sm text-[var(--muted-foreground)]">
            Recipe usage requires the recipe.read permission.
          </p>
        ) : usageQuery.isPending ? (
          <p className="mt-3 text-sm text-[var(--muted-foreground)]">
            Loading recipe usage...
          </p>
        ) : usageQuery.isError ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Unable to load tenant-scoped recipe usage.
          </p>
        ) : (
          <>
            {!usageQuery.data?.data.length ? (
              <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                This ingredient is not currently used by any recipe.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {usageQuery.data.data.map((usage) => (
                  <div
                    key={usage.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] p-3 text-sm"
                  >
                    <span className="font-medium">
                      {usage.Recipe.Product.name}
                      {usage.Recipe.Product.sku
                        ? ` (${usage.Recipe.Product.sku})`
                        : ""}
                    </span>
                    <span>
                      {usage.quantity} {ingredient.unit} per recipe
                    </span>
                  </div>
                ))}
              </div>
            )}
            {usageQuery.data && usageQuery.data.pagination.totalPages > 1 ? (
              <div className="mt-3 flex items-center justify-between text-sm">
                <span>
                  Page {usagePage} of {usageQuery.data.pagination.totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={usagePage <= 1 || usageQuery.isFetching}
                    onClick={() => setUsagePage((page) => page - 1)}
                    className="rounded-lg border border-[var(--border)] px-3 py-1 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={
                      usagePage >= usageQuery.data.pagination.totalPages ||
                      usageQuery.isFetching
                    }
                    onClick={() => setUsagePage((page) => page + 1)}
                    className="rounded-lg border border-[var(--border)] px-3 py-1 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>
      <Link
        href="/app/ingredients"
        className="mt-6 inline-flex text-sm font-semibold text-[var(--primary)] hover:underline"
      >
        Back to ingredients
      </Link>
    </>
  );
}
