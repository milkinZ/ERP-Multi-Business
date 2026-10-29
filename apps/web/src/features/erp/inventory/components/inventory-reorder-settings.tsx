"use client";

import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/api/client";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";
import {
  getInventoryReorderRules,
  inventoryKeys,
  replaceInventoryReorderRules,
  type InventoryReorderAction,
  type InventoryReorderQuantityStrategy,
  type InventoryReorderRules,
  type InventoryReorderScope,
} from "@/features/erp/inventory/api/queries";
import {
  getWarehouses,
  warehouseKeys,
} from "@/features/erp/warehouses/api/queries";

type DraftRule = {
  warehouseId: string;
  reorderPoint: string;
  quantityStrategy: InventoryReorderQuantityStrategy;
  targetStock: string;
  fixedOrderQuantity: string;
  action: InventoryReorderAction;
};

const newRule = (warehouseId = ""): DraftRule => ({
  warehouseId,
  reorderPoint: "0",
  quantityStrategy: "TARGET_STOCK",
  targetStock: "1",
  fixedOrderQuantity: "",
  action: "ALERT_AND_SUGGEST",
});

export function InventoryReorderSettings({
  inventoryItemId,
}: {
  inventoryItemId: string;
}) {
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const tenantId = session?.tenantId;
  const canRead = hasPermission(session, "inventory.read");
  const canAdjust = hasPermission(session, "inventory.adjust");
  const canReadWarehouses = hasPermission(session, "warehouse.read");
  const queryClient = useQueryClient();
  const [scope, setScope] =
    useState<InventoryReorderScope>("TENANT_ITEM_TOTAL");
  const [rules, setRules] = useState<DraftRule[]>([]);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const rulesQuery = useQuery({
    queryKey: tenantId
      ? inventoryKeys.reorderRules(tenantId, inventoryItemId)
      : ["inventory-reorder-rules", "unauthenticated", inventoryItemId],
    queryFn: () => getInventoryReorderRules(token as string, inventoryItemId),
    enabled: Boolean(token && tenantId && inventoryItemId && canRead),
  });
  const warehousesQuery = useQuery({
    queryKey: tenantId
      ? warehouseKeys.all(tenantId)
      : ["warehouses", "unauthenticated"],
    queryFn: () => getWarehouses(token as string),
    enabled: Boolean(
      token && tenantId && canReadWarehouses && scope === "PER_WAREHOUSE",
    ),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!rulesQuery.data) return;
    const existing = rulesQuery.data;
    setScope(existing[0]?.scope ?? "TENANT_ITEM_TOTAL");
    setRules(
      existing.map((rule) => ({
        warehouseId: rule.warehouseId ?? "",
        reorderPoint: String(rule.reorderPoint),
        quantityStrategy: rule.quantityStrategy,
        targetStock: rule.targetStock == null ? "" : String(rule.targetStock),
        fixedOrderQuantity:
          rule.fixedOrderQuantity == null
            ? ""
            : String(rule.fixedOrderQuantity),
        action: rule.action ?? "ALERT_AND_SUGGEST",
      })),
    );
  }, [rulesQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (input: InventoryReorderRules) =>
      replaceInventoryReorderRules(token as string, inventoryItemId, input),
    onSuccess: async () => {
      if (tenantId) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: inventoryKeys.reorderRules(tenantId, inventoryItemId),
          }),
          queryClient.invalidateQueries({
            queryKey: inventoryKeys.availability(tenantId, inventoryItemId),
          }),
        ]);
      }
      setSavedMessage("Reorder rules saved.");
    },
    onError: () => setSavedMessage(null),
  });

  if (!canRead) return null;

  if (rulesQuery.isPending) {
    return (
      <div className="mt-6 h-24 animate-pulse rounded-xl bg-[var(--muted)]" />
    );
  }

  if (rulesQuery.isError) {
    return (
      <p role="alert" className="mt-4 text-sm text-red-700">
        {rulesQuery.error instanceof ApiError && rulesQuery.error.status === 403
          ? "Your session is not authorized to view inventory reorder rules."
          : "The Inventory API could not return reorder rules."}
      </p>
    );
  }

  function updateRule(index: number, patch: Partial<DraftRule>) {
    setRules((current) =>
      current.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...patch } : rule,
      ),
    );
  }

  function submitRules(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavedMessage(null);
    saveMutation.mutate({
      scope,
      rules: rules.map((rule) => ({
        ...(scope === "PER_WAREHOUSE" ? { warehouseId: rule.warehouseId } : {}),
        reorderPoint: Number(rule.reorderPoint),
        quantityStrategy: rule.quantityStrategy,
        ...(rule.quantityStrategy === "TARGET_STOCK"
          ? { targetStock: Number(rule.targetStock) }
          : { fixedOrderQuantity: Number(rule.fixedOrderQuantity) }),
        action: rule.action,
      })),
    });
  }

  const warehouseRulesUnavailable =
    scope === "PER_WAREHOUSE" && !canReadWarehouses;
  const warehouseOptions = warehousesQuery.data ?? [];

  return (
    <div className="mt-6 border-t border-[var(--border)] pt-5">
      <div>
        <h3 className="text-lg font-semibold text-[var(--foreground)]">
          Reorder policy
        </h3>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Alerts are based on available stock. Suggestions do not create
          purchase orders.
        </p>
      </div>

      {canAdjust ? (
        <form className="mt-4 space-y-4" onSubmit={submitRules}>
          <label className="block text-sm font-medium">
            Scope
            <select
              className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2"
              value={scope}
              onChange={(event) => {
                setScope(event.target.value as InventoryReorderScope);
                setRules([]);
                setSavedMessage(null);
              }}
            >
              <option value="TENANT_ITEM_TOTAL">Total across tenant</option>
              <option value="PER_WAREHOUSE">Per warehouse</option>
            </select>
          </label>

          {warehouseRulesUnavailable ? (
            <p role="alert" className="text-sm text-amber-800">
              The warehouse.read permission is required to configure
              per-warehouse rules.
            </p>
          ) : null}

          {rules.map((rule, index) => (
            <fieldset
              key={`${rule.warehouseId}-${index}`}
              className="grid gap-3 rounded-xl border border-[var(--border)] p-3 sm:grid-cols-2"
            >
              <legend className="px-1 text-sm font-semibold">
                Rule {index + 1}
              </legend>
              {scope === "PER_WAREHOUSE" ? (
                <label className="text-sm">
                  Warehouse
                  <select
                    required
                    disabled={!canReadWarehouses || warehousesQuery.isPending}
                    className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2"
                    value={rule.warehouseId}
                    onChange={(event) =>
                      updateRule(index, { warehouseId: event.target.value })
                    }
                  >
                    <option value="">Select a warehouse</option>
                    {warehouseOptions.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name} ({warehouse.code})
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="text-sm">
                Reorder point
                <input
                  required
                  type="number"
                  min="0"
                  step="any"
                  className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2"
                  value={rule.reorderPoint}
                  onChange={(event) =>
                    updateRule(index, { reorderPoint: event.target.value })
                  }
                />
              </label>
              <label className="text-sm">
                Quantity strategy
                <select
                  className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2"
                  value={rule.quantityStrategy}
                  onChange={(event) =>
                    updateRule(index, {
                      quantityStrategy: event.target
                        .value as InventoryReorderQuantityStrategy,
                    })
                  }
                >
                  <option value="TARGET_STOCK">Restore to target stock</option>
                  <option value="FIXED_QUANTITY">Fixed quantity</option>
                </select>
              </label>
              {rule.quantityStrategy === "TARGET_STOCK" ? (
                <label className="text-sm">
                  Target stock
                  <input
                    required
                    type="number"
                    min="0"
                    step="any"
                    className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2"
                    value={rule.targetStock}
                    onChange={(event) =>
                      updateRule(index, { targetStock: event.target.value })
                    }
                  />
                </label>
              ) : (
                <label className="text-sm">
                  Fixed quantity
                  <input
                    required
                    type="number"
                    min="0.000001"
                    step="any"
                    className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2"
                    value={rule.fixedOrderQuantity}
                    onChange={(event) =>
                      updateRule(index, {
                        fixedOrderQuantity: event.target.value,
                      })
                    }
                  />
                </label>
              )}
              <label className="text-sm">
                Action
                <select
                  className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2"
                  value={rule.action}
                  onChange={(event) =>
                    updateRule(index, {
                      action: event.target.value as InventoryReorderAction,
                    })
                  }
                >
                  <option value="ALERT_ONLY">Alert only</option>
                  <option value="ALERT_AND_SUGGEST">Alert and suggest</option>
                </select>
              </label>
              <button
                type="button"
                className="justify-self-start text-sm font-medium text-red-700"
                onClick={() =>
                  setRules((current) =>
                    current.filter((_, ruleIndex) => ruleIndex !== index),
                  )
                }
              >
                Remove rule
              </button>
            </fieldset>
          ))}

          {scope === "TENANT_ITEM_TOTAL" && rules.length > 0 ? null : (
            <button
              type="button"
              disabled={
                warehouseRulesUnavailable ||
                (scope === "TENANT_ITEM_TOTAL" && rules.length > 0) ||
                (scope === "PER_WAREHOUSE" &&
                  (warehousesQuery.isPending ||
                    warehousesQuery.isError ||
                    !warehouseOptions.some(
                      (warehouse) =>
                        !rules.some(
                          (rule) => rule.warehouseId === warehouse.id,
                        ),
                    )))
              }
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50"
              onClick={() => {
                const availableWarehouse = warehouseOptions.find(
                  (warehouse) =>
                    !rules.some((rule) => rule.warehouseId === warehouse.id),
                );
                setRules((current) => [
                  ...current,
                  newRule(availableWarehouse?.id),
                ]);
              }}
            >
              Add rule
            </button>
          )}
          {scope === "PER_WAREHOUSE" && warehousesQuery.isError ? (
            <p role="alert" className="text-sm text-red-700">
              The warehouse list could not be loaded. Reorder rules were not
              saved.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={
                saveMutation.isPending ||
                warehouseRulesUnavailable ||
                (scope === "PER_WAREHOUSE" && !canReadWarehouses)
              }
              className="rounded-lg bg-[var(--foreground)] px-4 py-2 text-sm font-semibold text-[var(--panel)] disabled:opacity-50"
            >
              {saveMutation.isPending ? "Saving..." : "Save reorder policy"}
            </button>
            {savedMessage ? (
              <span role="status" className="text-sm text-green-700">
                {savedMessage}
              </span>
            ) : null}
            {saveMutation.isError ? (
              <span role="alert" className="text-sm text-red-700">
                {saveMutation.error instanceof Error
                  ? saveMutation.error.message
                  : "Unable to save reorder rules."}
              </span>
            ) : null}
          </div>
        </form>
      ) : (
        <p className="mt-3 text-sm text-[var(--muted-foreground)]">
          You need inventory.adjust permission to change reorder rules.
        </p>
      )}
    </div>
  );
}
