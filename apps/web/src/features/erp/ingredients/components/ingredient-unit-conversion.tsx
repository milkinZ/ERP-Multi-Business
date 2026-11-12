"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/api/client";
import {
  convertIngredientUnit,
  createUnitConversion,
  getUnitConversions,
  ingredientKeys,
} from "@/features/erp/ingredients/api/queries";
import { useAuthStore } from "@/stores/auth.store";

export function IngredientUnitConversion({
  ingredientId,
  currentUnit,
  canManage,
}: {
  ingredientId: string;
  currentUnit: string;
  canManage: boolean;
}) {
  const token = useAuthStore((state) => state.accessToken);
  const tenantId = useAuthStore((state) => state.session?.tenantId);
  const queryClient = useQueryClient();
  const [targetUnit, setTargetUnit] = useState("");
  const [convertHistory, setConvertHistory] = useState(false);
  const [fromUnit, setFromUnit] = useState(currentUnit);
  const [customToUnit, setCustomToUnit] = useState("");
  const [factor, setFactor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const conversionsQuery = useQuery({
    queryKey: tenantId
      ? ["ingredients", tenantId, "unit-conversions"]
      : ["ingredients", "unauthenticated", "unit-conversions"],
    queryFn: () => getUnitConversions(token as string),
    enabled: Boolean(token && tenantId && canManage),
    staleTime: 60_000,
  });

  async function refreshRelatedData() {
    if (!tenantId) return;
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ingredientKeys.detail(tenantId, ingredientId),
      }),
      queryClient.invalidateQueries({ queryKey: ingredientKeys.all(tenantId) }),
      queryClient.invalidateQueries({ queryKey: ["inventory", tenantId] }),
      queryClient.invalidateQueries({ queryKey: ["recipes", tenantId] }),
    ]);
  }

  const conversionMutation = useMutation({
    mutationFn: () => {
      if (!token) throw new Error("Authentication required");
      return convertIngredientUnit(token, ingredientId, {
        unit: targetUnit.trim(),
        convertHistory,
      });
    },
    retry: 0,
    onSuccess: async () => {
      setError(null);
      setTargetUnit("");
      setConvertHistory(false);
      await refreshRelatedData();
    },
    onError: (cause) => {
      setError(
        cause instanceof Error ? cause.message : "Unable to convert unit",
      );
    },
  });

  const customMutation = useMutation({
    mutationFn: () => {
      if (!token) throw new Error("Authentication required");
      return createUnitConversion(token, {
        fromUnit: fromUnit.trim(),
        toUnit: customToUnit.trim(),
        factor: Number(factor),
      });
    },
    retry: 0,
    onSuccess: async () => {
      setCustomToUnit("");
      setFactor("");
      setError(null);
      if (tenantId) {
        await queryClient.invalidateQueries({
          queryKey: ["ingredients", tenantId, "unit-conversions"],
        });
      }
    },
    onError: (cause) => {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save the tenant conversion",
      );
    },
  });

  return (
    <section className="mt-6 rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
      <h2 className="text-sm font-semibold">Unit conversion</h2>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        Built-in conversions cover mg/g/kg, ml/l, and ea/pcs within each family.
        Custom factors can connect tenant units, including cross-family units.
        Current unit: <strong>{currentUnit}</strong>.
      </p>
      {canManage ? (
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <form
            className="space-y-3 rounded-xl border border-[var(--border)] p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!targetUnit.trim()) return;
              const confirmed = window.confirm(
                `Convert ${ingredientId} from ${currentUnit} to ${targetUnit.trim()}? On-hand stock, active costing, reorder settings, active recipes, and open purchase/transfer documents will be converted. ${
                  convertHistory
                    ? "Stored transaction history will also be converted."
                    : "Past transaction quantities remain in their recorded units."
                }`,
              );
              if (confirmed) conversionMutation.mutate();
            }}
          >
            <label className="block text-sm font-medium">
              New stock unit
              <input
                value={targetUnit}
                onChange={(event) => setTargetUnit(event.target.value)}
                maxLength={32}
                required
                placeholder="e.g. g, ml, scoop"
                className="mt-2 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3"
              />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={convertHistory}
                onChange={(event) => setConvertHistory(event.target.checked)}
                className="mt-1 accent-[var(--primary)]"
              />
              Convert stored transaction history too (otherwise prior
              transaction units are preserved)
            </label>
            <button
              type="submit"
              disabled={
                conversionMutation.isPending ||
                !token ||
                !targetUnit.trim() ||
                targetUnit.trim().toLocaleLowerCase() ===
                  currentUnit.trim().toLocaleLowerCase()
              }
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {conversionMutation.isPending ? "Converting..." : "Convert unit"}
            </button>
          </form>

          <form
            className="space-y-3 rounded-xl border border-[var(--border)] p-4"
            onSubmit={(event) => {
              event.preventDefault();
              customMutation.mutate();
            }}
          >
            <h3 className="text-sm font-semibold">Add tenant conversion</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">
                From
                <input
                  value={fromUnit}
                  onChange={(event) => setFromUnit(event.target.value)}
                  maxLength={32}
                  required
                  className="mt-2 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3"
                />
              </label>
              <label className="text-sm font-medium">
                To
                <input
                  value={customToUnit}
                  onChange={(event) => setCustomToUnit(event.target.value)}
                  maxLength={32}
                  required
                  className="mt-2 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3"
                />
              </label>
            </div>
            <label className="block text-sm font-medium">
              Target units for one source unit
              <input
                value={factor}
                onChange={(event) => setFactor(event.target.value)}
                type="number"
                min="0.000000000001"
                max="1000000000000"
                step="any"
                required
                placeholder="1 source unit = factor target units"
                className="mt-2 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3"
              />
            </label>
            <p className="text-xs text-[var(--muted-foreground)]">
              Example: if one scoop is 12.5 g, set From “scoop”, To “g”, factor
              12.5. Conversion factors are tenant-wide and cannot override an
              existing conversion path.
            </p>
            <button
              type="submit"
              disabled={
                customMutation.isPending ||
                !token ||
                !fromUnit.trim() ||
                !customToUnit.trim() ||
                !Number.isFinite(Number(factor)) ||
                Number(factor) <= 0
              }
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {customMutation.isPending ? "Saving..." : "Add conversion"}
            </button>
          </form>
        </div>
      ) : (
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">
          Managing conversions requires both ingredient.update and
          inventory.adjust permissions.
        </p>
      )}
      {conversionsQuery.isError ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {conversionsQuery.error instanceof ApiError
            ? conversionsQuery.error.message
            : "Unable to load tenant unit conversions."}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {conversionsQuery.data?.length ? (
        <ul className="mt-4 divide-y divide-[var(--border)] text-sm">
          {conversionsQuery.data.map((conversion) => (
            <li
              key={conversion.id}
              className="flex justify-between gap-3 py-2 text-[var(--muted-foreground)]"
            >
              <span>
                1 {conversion.fromUnit} = {conversion.factor}{" "}
                {conversion.toUnit}
              </span>
              <span>Tenant rule</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
