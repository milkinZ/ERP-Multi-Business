"use client";

import React, { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/api/client";
import {
  ingredientKeys,
  removeIngredient,
  updateIngredient,
  type Ingredient,
  type UpdateIngredientInput,
} from "@/features/erp/ingredients/api/queries";
import { useAuthStore } from "@/stores/auth.store";

export function IngredientEditForm({
  ingredient,
  canUpdate,
  canDelete,
}: {
  ingredient: Ingredient;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const token = useAuthStore((state) => state.accessToken);
  const tenantId = useAuthStore((state) => state.session?.tenantId);
  const queryClient = useQueryClient();
  const [name, setName] = useState(ingredient.name);
  const [unit, setUnit] = useState(ingredient.unit);
  const [isActive, setIsActive] = useState(ingredient.InventoryItem.isActive);
  const [serverError, setServerError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeNotice, setRemoveNotice] = useState<string | null>(null);
  useEffect(() => {
    setName(ingredient.name);
    setUnit(ingredient.unit);
    setIsActive(ingredient.InventoryItem.isActive);
  }, [ingredient.name, ingredient.unit, ingredient.InventoryItem.isActive]);

  async function invalidateIngredientQueries() {
    if (!tenantId) return;
    await queryClient.invalidateQueries({
      queryKey: ingredientKeys.all(tenantId),
    });
    await queryClient.invalidateQueries({
      queryKey: ["inventory", tenantId],
    });
  }

  const mutation = useMutation({
    mutationFn: (input: UpdateIngredientInput) => {
      if (!token) throw new Error("Authentication required");
      return updateIngredient(token, ingredient.id, input);
    },
    retry: 0,
    onSuccess: async () => {
      await invalidateIngredientQueries();
      setServerError(null);
    },
    onError: (cause) => {
      if (cause instanceof ApiError && cause.status === 403) {
        setServerError("You do not have permission to update ingredients.");
      } else if (cause instanceof ApiError && cause.status === 400) {
        setServerError(
          cause.message ||
            "The update was rejected. Check whether the unit can still be changed.",
        );
      } else {
        setServerError(
          cause instanceof Error
            ? cause.message
            : "Unable to update ingredient",
        );
      }
    },
  });
  const removeMutation = useMutation({
    mutationFn: () => {
      if (!token) throw new Error("Authentication required");
      return removeIngredient(token, ingredient.id);
    },
    retry: 0,
    onSuccess: async (result) => {
      if (result.deactivated) {
        await invalidateIngredientQueries();
        setRemoveNotice(
          "Ingredient has inventory or recipe history and was deactivated. Existing records are preserved.",
        );
      } else {
        router.push("/app/ingredients");
      }
    },
    onError: (cause) => {
      setRemoveError(
        cause instanceof Error ? cause.message : "Unable to remove ingredient",
      );
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUpdate) return;
    const input: UpdateIngredientInput = {};
    if (name.trim() !== ingredient.name) input.name = name.trim();
    if (unit.trim() !== ingredient.unit) input.unit = unit.trim();
    if (isActive !== ingredient.InventoryItem.isActive) {
      input.isActive = isActive;
    }
    if (!Object.keys(input).length) {
      setServerError("No changes to save.");
      return;
    }
    mutation.mutate(input);
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
      {canUpdate ? (
        <>
          <label className="text-sm font-medium text-[var(--foreground)]">
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              required
              className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3"
            />
          </label>
          <label className="text-sm font-medium text-[var(--foreground)]">
            Unit
            <input
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              maxLength={32}
              required
              className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3"
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            Active ingredient
          </label>
        </>
      ) : null}
      <div className="sm:col-span-2">
        {canUpdate && serverError ? (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {serverError}
          </p>
        ) : null}
        {canUpdate ? (
          <>
            <p className="mb-3 text-xs text-[var(--muted-foreground)]">
              Unit changes are locked after stock, movement, or recipe usage
              exists. Deactivation preserves historical records.
            </p>
            <button
              type="submit"
              disabled={mutation.isPending || !token}
              className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {mutation.isPending ? "Saving..." : "Save ingredient"}
            </button>
          </>
        ) : null}
        {canDelete ? (
          <div className={canUpdate ? "mt-4" : undefined}>
            {removeError ? (
              <p role="alert" className="mb-3 text-sm text-destructive">
                {removeError}
              </p>
            ) : null}
            {removeNotice ? (
              <p role="status" className="mb-3 text-sm text-[var(--success)]">
                {removeNotice}
              </p>
            ) : null}
            <button
              type="button"
              disabled={removeMutation.isPending || !token}
              onClick={() => {
                if (
                  window.confirm(
                    `Remove ingredient ${ingredient.name}? If referenced by stock, movements, recipes, or orders it will be deactivated and its history preserved; otherwise it will be deleted.`,
                  )
                ) {
                  setRemoveError(null);
                  removeMutation.mutate();
                }
              }}
              className="rounded-xl border border-destructive/30 px-4 py-2 text-sm font-semibold text-destructive disabled:opacity-50"
            >
              {removeMutation.isPending ? "Removing..." : "Remove ingredient"}
            </button>
          </div>
        ) : null}
      </div>
    </form>
  );
}
