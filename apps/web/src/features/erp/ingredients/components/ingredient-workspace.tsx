"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import {
  EmptyState,
  SectionHeader,
  StatusBadge,
  UnavailableState,
} from "@/components/data-display/states";
import { ApiError } from "@/lib/api/client";
import { hasPermission } from "@/lib/permissions";
import { IngredientForm } from "@/features/erp/ingredients/components/ingredient-form";
import {
  getIngredientPage,
  ingredientKeys,
} from "@/features/erp/ingredients/api/queries";
import { useAuthStore } from "@/stores/auth.store";

export function IngredientWorkspace() {
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const tenantId = session?.tenantId;
  const canRead = hasPermission(session, "ingredient.read");
  const canCreate = hasPermission(session, "ingredient.create");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);
  const listQuery = {
    page,
    limit: 20,
    search: debouncedSearch.trim() || undefined,
    isActive: activeFilter === "all" ? undefined : activeFilter === "active",
  };

  const query = useQuery({
    queryKey: tenantId
      ? ingredientKeys.list(tenantId, listQuery)
      : ["ingredients", "unauthenticated"],
    queryFn: () => getIngredientPage(token as string, listQuery),
    enabled: Boolean(token && tenantId && canRead),
    staleTime: 60_000,
  });

  if (!canRead) {
    return (
      <UnavailableState
        title="Ingredient access is restricted"
        description="Your current tenant session does not include the ingredient.read permission."
      />
    );
  }

  if (query.isPending) {
    return (
      <div className="space-y-3">
        <div className="h-20 animate-pulse rounded-[24px] bg-[var(--muted)]" />
        <div className="h-64 animate-pulse rounded-[24px] bg-[var(--muted)]" />
      </div>
    );
  }

  if (query.isError) {
    const message =
      query.error instanceof ApiError && query.error.status === 403
        ? "Your session is not authorized to view ingredients."
        : "The Ingredients API could not be reached. No ingredient records are shown.";
    return (
      <UnavailableState
        title="Unable to load ingredients"
        description={message}
      />
    );
  }

  const ingredients = query.data?.data ?? [];
  const pagination = query.data?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">
            Ingredient master data
          </p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Tenant-scoped records returned by the backend.
          </p>
        </div>
        {canCreate ? (
          <button
            type="button"
            onClick={() => setIsCreateOpen((open) => !open)}
            className="rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            {isCreateOpen ? "Close form" : "New ingredient"}
          </button>
        ) : (
          <StatusBadge tone="neutral">Read only</StatusBadge>
        )}
      </div>

      {isCreateOpen && canCreate ? (
        <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <SectionHeader
            eyebrow="Master data action"
            title="Create ingredient"
          />
          <IngredientForm onCreated={() => setIsCreateOpen(false)} />
        </section>
      ) : null}

      <section className="grid gap-3 rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-[var(--foreground)]">
          Search ingredients
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            maxLength={100}
            placeholder="Ingredient, unit, or inventory item code"
            className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 font-normal"
          />
        </label>
        <label className="text-sm font-medium text-[var(--foreground)]">
          Status
          <select
            value={activeFilter}
            onChange={(event) => {
              setActiveFilter(event.target.value as typeof activeFilter);
              setPage(1);
            }}
            className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 font-normal"
          >
            <option value="all">All ingredients</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      </section>

      {!ingredients.length ? (
        <EmptyState
          title={
            search || activeFilter !== "all"
              ? "No matching ingredients"
              : "No ingredients yet"
          }
          description={
            search || activeFilter !== "all"
              ? "Try changing the search or status filter."
              : "This tenant has no ingredient records available from the current backend contract."
          }
        />
      ) : (
        <>
          <section className="hidden overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--panel)] md:block">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[var(--muted)] text-[var(--muted-foreground)]">
                  <tr>
                    {[
                      "Ingredient",
                      "Unit",
                      "Inventory item",
                      "Status",
                      "Created",
                    ].map((heading) => (
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
                  {ingredients.map((ingredient) => (
                    <tr
                      key={ingredient.id}
                      className="border-t border-[var(--border)] transition-colors hover:bg-[var(--muted)]/50"
                    >
                      <td className="px-4 py-4">
                        <Link
                          href={`/app/ingredients/${ingredient.id}`}
                          className="font-semibold text-[var(--foreground)] hover:text-[var(--primary)]"
                        >
                          {ingredient.name}
                        </Link>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                          {ingredient.id}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge
                          tone={
                            ingredient.InventoryItem.isActive
                              ? "success"
                              : "neutral"
                          }
                        >
                          {ingredient.InventoryItem.isActive
                            ? "Active"
                            : "Inactive"}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-4 text-[var(--muted-foreground)]">
                        {ingredient.unit}
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-medium text-[var(--foreground)]">
                          {ingredient.InventoryItem.name}
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {ingredient.InventoryItem.code}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-[var(--muted-foreground)]">
                        {new Date(ingredient.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="space-y-3 md:hidden">
            {ingredients.map((ingredient) => (
              <Link
                key={ingredient.id}
                href={`/app/ingredients/${ingredient.id}`}
                className="block rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[var(--foreground)]">
                      {ingredient.name}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      {ingredient.InventoryItem.name} ·{" "}
                      {ingredient.InventoryItem.code}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <StatusBadge tone="info">{ingredient.unit}</StatusBadge>
                    <StatusBadge
                      tone={
                        ingredient.InventoryItem.isActive
                          ? "success"
                          : "neutral"
                      }
                    >
                      {ingredient.InventoryItem.isActive
                        ? "Active"
                        : "Inactive"}
                    </StatusBadge>
                  </div>
                </div>
                <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                  Created {new Date(ingredient.createdAt).toLocaleDateString()}
                </p>
              </Link>
            ))}
          </section>
        </>
      )}

      {pagination ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm">
          <span className="text-[var(--muted-foreground)]">
            {pagination.total} ingredient{pagination.total === 1 ? "" : "s"} ·
            Page {pagination.page} of {Math.max(pagination.totalPages, 1)}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || query.isFetching}
              onClick={() => setPage((value) => value - 1)}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= pagination.totalPages || query.isFetching}
              onClick={() => setPage((value) => value + 1)}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5">
        <SectionHeader
          eyebrow="Contract note"
          title="Current ingredient capability"
        />
        <p className="text-sm text-[var(--muted-foreground)]">
          Ingredient creation and edits update the linked inventory item
          atomically. Deactivation preserves records; unit changes are blocked
          after stock or movement history exists.
        </p>
      </section>
    </div>
  );
}
