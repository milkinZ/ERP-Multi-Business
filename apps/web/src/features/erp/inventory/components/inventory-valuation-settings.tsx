"use client";

import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { UnavailableState } from "@/components/data-display/states";
import { ApiError } from "@/lib/api/client";
import { hasPermission } from "@/lib/permissions";
import {
  configureInventoryValuation,
  getInventoryValuation,
  inventoryKeys,
  type InventoryValuation,
  type InventoryValuationMethod,
  type MovingAverageScope,
} from "@/features/erp/inventory/api/queries";
import { useAuthStore } from "@/stores/auth.store";

function openingCostQuantityForBalance(
  balance: InventoryValuation["balances"][number],
  method: InventoryValuationMethod | "",
  scope: MovingAverageScope | "",
) {
  if (method === "FIFO") return Number(balance.fifoOpeningCostQuantity);
  if (method === "MOVING_WEIGHTED_AVERAGE") {
    if (scope === "PER_ITEM") {
      return Number(balance.movingAverageItemOpeningCostQuantity);
    }
    if (scope === "PER_WAREHOUSE") {
      return Number(balance.movingAverageWarehouseOpeningCostQuantity);
    }
  }
  return balance.quantity;
}

const valuationMethods: Array<{
  value: InventoryValuationMethod;
  label: string;
}> = [
  { value: "FIFO", label: "FIFO" },
  {
    value: "MOVING_WEIGHTED_AVERAGE",
    label: "Moving weighted average",
  },
  { value: "STANDARD_COST", label: "Standard cost" },
];

export function InventoryValuationSettings({
  inventoryItemId,
}: {
  inventoryItemId: string;
}) {
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const tenantId = session?.tenantId;
  const canRead = hasPermission(session, "inventory.read");
  const canAdjust = hasPermission(session, "inventory.adjust");
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<InventoryValuationMethod | "">("");
  const [scope, setScope] = useState<MovingAverageScope | "">("");
  const [standardCost, setStandardCost] = useState("");
  const [openingCosts, setOpeningCosts] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const queryKey = tenantId
    ? inventoryKeys.valuation(tenantId, inventoryItemId)
    : ["inventory-valuation", "unauthenticated", inventoryItemId];

  const query = useQuery({
    queryKey,
    queryFn: () => getInventoryValuation(token as string, inventoryItemId),
    enabled: Boolean(token && tenantId && canRead && inventoryItemId),
  });

  useEffect(() => {
    if (!query.data) return;
    setMethod(query.data.valuationMethod ?? "");
    setScope(query.data.movingAverageScope ?? "");
    setStandardCost(
      query.data.standardCost === null ? "" : String(query.data.standardCost),
    );
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!token || !method) {
        throw new Error("Choose a valuation method first.");
      }
      if (method === "STANDARD_COST") {
        const parsedCost = Number(standardCost);
        if (!Number.isFinite(parsedCost) || parsedCost < 0) {
          throw new Error("Enter a valid standard cost.");
        }
        return configureInventoryValuation(token, inventoryItemId, {
          method,
          standardCost: parsedCost,
        });
      }
      if (method === "MOVING_WEIGHTED_AVERAGE" && !scope) {
        throw new Error("Choose the moving average scope.");
      }
      const positiveBalances =
        query.data?.balances.filter((balance) => balance.quantity > 0) ?? [];
      const balancesRequiringOpeningCost = positiveBalances.filter(
        (balance) => openingCostQuantityForBalance(balance, method, scope) > 0,
      );
      const initialCosts = balancesRequiringOpeningCost.map((balance) => {
        const key = balance.warehouseId ?? "";
        const unitCost = Number(openingCosts[key]);
        const requiredQuantity = openingCostQuantityForBalance(
          balance,
          method,
          scope,
        );
        if (!Number.isFinite(unitCost) || unitCost < 0) {
          throw new Error(
            `Enter an opening cost for ${balance.warehouseId ?? "unassigned stock"} (${requiredQuantity} units).`,
          );
        }
        return { warehouseId: balance.warehouseId, unitCost };
      });
      return configureInventoryValuation(token, inventoryItemId, {
        method,
        ...(method === "MOVING_WEIGHTED_AVERAGE"
          ? { movingAverageScope: scope as MovingAverageScope }
          : {}),
        openingCosts: initialCosts,
      });
    },
    retry: 0,
    onSuccess: async () => {
      setErrorMessage(null);
      if (tenantId) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey }),
          queryClient.invalidateQueries({
            queryKey: inventoryKeys.item(tenantId, inventoryItemId),
          }),
          queryClient.invalidateQueries({
            queryKey: inventoryKeys.stockBalances(tenantId, inventoryItemId),
          }),
        ]);
      }
    },
    onError: (cause) => {
      setErrorMessage(
        cause instanceof ApiError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : "Unable to configure inventory valuation.",
      );
    },
  });

  if (!canRead) return null;
  if (query.isPending) {
    return (
      <section className="mt-6 h-48 animate-pulse rounded-[22px] border border-[var(--border)] bg-[var(--panel)]" />
    );
  }
  if (query.isError) {
    return (
      <UnavailableState
        title="Unable to load inventory valuation"
        description={
          query.error instanceof ApiError && query.error.status === 403
            ? "Your session is not authorized to view inventory valuation."
            : "The valuation API could not be reached. No costs were changed."
        }
      />
    );
  }

  const locked = Boolean(query.data.lockedAt);
  const positiveBalances = query.data.balances.filter(
    (balance) => balance.quantity > 0,
  );
  const balancesRequiringOpeningCost = positiveBalances.filter((balance) => {
    return openingCostQuantityForBalance(balance, method, scope) > 0;
  });

  return (
    <section className="mt-6 max-w-4xl space-y-5 rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
      <div>
        <h2 className="text-lg font-semibold">Inventory valuation</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Choose the costing method before the first valued stock transaction.
          Reconciled history is replayed automatically when its receipt costs
          can be verified; remaining untraceable balances need an opening cost.
          {query.data.currencyCode
            ? ` Costs are recorded in ${query.data.currencyCode}.`
            : " Configure the tenant base currency before entering costs."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Valuation method
          <select
            value={method}
            onChange={(event) =>
              setMethod(event.target.value as InventoryValuationMethod | "")
            }
            disabled={!canAdjust || locked || mutation.isPending}
            className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3"
          >
            <option value="">Select a method</option>
            {valuationMethods.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {method === "MOVING_WEIGHTED_AVERAGE" ? (
          <label className="text-sm font-medium">
            Average cost pool
            <select
              value={scope}
              onChange={(event) =>
                setScope(event.target.value as MovingAverageScope | "")
              }
              disabled={!canAdjust || locked || mutation.isPending}
              className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3"
            >
              <option value="">Select a scope</option>
              <option value="PER_WAREHOUSE">Per item per warehouse</option>
              <option value="PER_ITEM">Per item across all warehouses</option>
            </select>
          </label>
        ) : null}
        {method === "STANDARD_COST" ? (
          <label className="text-sm font-medium">
            Standard unit cost
            <input
              value={standardCost}
              onChange={(event) => setStandardCost(event.target.value)}
              type="number"
              min="0"
              step="0.000001"
              disabled={!canAdjust || locked || mutation.isPending}
              className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3"
            />
          </label>
        ) : null}
      </div>

      {method !== "STANDARD_COST" && balancesRequiringOpeningCost.length > 0 ? (
        <div className="space-y-3 rounded-xl border border-[var(--border)] p-4">
          <div>
            <h3 className="text-sm font-semibold">Opening unit costs</h3>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              {method === "FIFO"
                ? "Traceable purchase receipts are reconstructed automatically. Enter costs only for remaining units without a verified cost history."
                : "Verified historical receipts are replayed automatically. Enter costs for each positive location balance whose history cannot be reconstructed."}
            </p>
          </div>
          {balancesRequiringOpeningCost.map((balance) => {
            const key = balance.warehouseId ?? "";
            const label = balance.warehouseId ?? "Unassigned stock location";
            const requiredQuantity = openingCostQuantityForBalance(
              balance,
              method,
              scope,
            );
            return (
              <label
                key={label}
                className="grid gap-2 text-sm font-medium sm:grid-cols-[1fr_1fr]"
              >
                <span>
                  {label} · {requiredQuantity} units
                </span>
                <input
                  value={openingCosts[key] ?? ""}
                  onChange={(event) =>
                    setOpeningCosts((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                  type="number"
                  min="0"
                  step="0.000001"
                  disabled={!canAdjust || locked || mutation.isPending}
                  placeholder="Unit cost"
                  className="h-10 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3"
                />
              </label>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-[var(--muted-foreground)]">
          {query.data.status === "SETUP_REQUIRED"
            ? "Valuation has not been configured."
            : query.data.status === "OPENING_COST_REQUIRED"
              ? "Some stock balances do not yet have a complete cost basis."
              : `Current inventory value: ${query.data.currencyCode ?? ""} ${query.data.totalValue ?? "—"}`}
        </p>
        {canAdjust && !locked ? (
          <Button
            type="button"
            disabled={mutation.isPending || !method}
            onClick={() => {
              setErrorMessage(null);
              mutation.mutate();
            }}
          >
            {mutation.isPending ? "Saving..." : "Save valuation method"}
          </Button>
        ) : null}
        {locked ? (
          <span className="text-xs font-medium text-[var(--muted-foreground)]">
            Method locked after the first valued stock transaction.
          </span>
        ) : null}
      </div>
      {errorMessage ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}
