"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";

import {
  EmptyState,
  SectionHeader,
  UnavailableState,
} from "@/components/data-display/states";
import { ApiError } from "@/lib/api/client";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";
import {
  getInventoryAvailability,
  inventoryKeys,
} from "@/features/erp/inventory/api/queries";
import type { InventoryReorderRecommendation } from "@/features/erp/inventory/api/queries";
import { InventoryReorderSettings } from "@/features/erp/inventory/components/inventory-reorder-settings";

function ReorderAlert({
  recommendation,
  label,
  unit,
}: {
  recommendation: InventoryReorderRecommendation | null;
  label: string;
  unit: string | null | undefined;
}) {
  if (!recommendation || recommendation.status !== "REORDER_REQUIRED") {
    return null;
  }

  return (
    <div
      role="status"
      className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
    >
      <p className="font-semibold">Reorder alert: {label}</p>
      <p className="mt-1">
        Available stock is {recommendation.availableQuantity}
        {unit ? ` ${unit}` : ""} (reorder point {recommendation.reorderPoint}
        {unit ? ` ${unit}` : ""}).
        {recommendation.recommendedQuantity !== null
          ? ` Suggested replenishment: ${recommendation.recommendedQuantity}${unit ? ` ${unit}` : ""}.`
          : " No quantity suggestion is configured."}
      </p>
    </div>
  );
}

export function InventoryStockBalances({
  inventoryItemId,
}: {
  inventoryItemId: string;
}) {
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const tenantId = session?.tenantId;
  const canRead = hasPermission(session, "inventory.read");
  const balancesQuery = useQuery({
    queryKey: tenantId
      ? inventoryKeys.availability(tenantId, inventoryItemId)
      : ["inventory-availability", "unauthenticated", inventoryItemId],
    queryFn: () => getInventoryAvailability(token as string, inventoryItemId),
    enabled: Boolean(token && tenantId && inventoryItemId && canRead),
    staleTime: 15_000,
  });

  if (!canRead) {
    return null;
  }

  if (balancesQuery.isPending) {
    return (
      <section className="mt-6 h-48 animate-pulse rounded-[22px] border border-[var(--border)] bg-[var(--panel)]" />
    );
  }

  if (balancesQuery.isError) {
    const description =
      balancesQuery.error instanceof ApiError &&
      balancesQuery.error.status === 403
        ? "Your session is not authorized to view inventory stock balances."
        : "The Inventory API could not return stock balances. No stock totals are shown.";
    return (
      <UnavailableState
        title="Unable to load warehouse stock"
        description={description}
      />
    );
  }

  const { balances, item, tenantTotalReplenishment, totals } =
    balancesQuery.data;

  return (
    <section className="mt-6 rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
      <SectionHeader
        eyebrow="Inventory availability"
        title="Balances by location"
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          ["On hand", totals.onHandQuantity],
          ["Reserved", totals.reservedQuantity],
          ["Available", totals.availableQuantity],
        ].map(([label, quantity]) => (
          <div key={label} className="rounded-xl bg-[var(--muted)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              {label}
            </p>
            <p className="mt-1 text-2xl font-semibold text-[var(--foreground)]">
              {quantity}
              {item.unit ? ` ${item.unit}` : ""}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        <ReorderAlert
          recommendation={tenantTotalReplenishment}
          label="tenant-wide total"
          unit={item.unit}
        />
        {balances.map((balance) => (
          <ReorderAlert
            key={balance.warehouseId ?? "unassigned"}
            recommendation={balance.replenishment}
            label={balance.warehouse?.name ?? "unassigned location"}
            unit={item.unit}
          />
        ))}
      </div>
      {!balances.length ? (
        <EmptyState
          title="No stock recorded"
          description="There are no stock rows for this inventory item."
        />
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--muted)] text-[var(--muted-foreground)]">
              <tr>
                {[
                  "Warehouse",
                  "Code",
                  "Outlet",
                  "On hand",
                  "Reserved",
                  "Available",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em]"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {balances.map((balance) => (
                <tr
                  key={balance.warehouseId ?? "unassigned"}
                  className="border-t border-[var(--border)]"
                >
                  <td className="px-3 py-3">
                    {balance.warehouse?.name ?? "Unassigned location"}
                  </td>
                  <td className="px-3 py-3 text-[var(--muted-foreground)]">
                    {balance.warehouse?.code ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-[var(--muted-foreground)]">
                    {balance.warehouse?.outletId ?? "—"}
                  </td>
                  <td className="px-3 py-3 font-medium">
                    {balance.onHandQuantity}
                    {item.unit ? ` ${item.unit}` : ""}
                  </td>
                  <td className="px-3 py-3">
                    {balance.reservedQuantity}
                    {item.unit ? ` ${item.unit}` : ""}
                  </td>
                  <td className="px-3 py-3 font-medium">
                    {balance.availableQuantity}
                    {item.unit ? ` ${item.unit}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <InventoryReorderSettings inventoryItemId={inventoryItemId} />
    </section>
  );
}
