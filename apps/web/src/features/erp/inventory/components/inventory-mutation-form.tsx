"use client";

import React, { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";
import {
  getWarehouses,
  warehouseKeys,
} from "@/features/erp/warehouses/api/queries";
import {
  adjustInventory,
  inventoryKeys,
  stockInInventory,
  wasteInventory,
  type InventoryItem,
} from "@/features/erp/inventory/api/queries";
import {
  inventoryMutationSchema,
  type InventoryMutationValues,
} from "@/features/erp/inventory/schemas/inventory-mutation.schema";

export function InventoryMutationForm({
  items,
  onSaved,
}: {
  items: InventoryItem[];
  onSaved: () => void;
}) {
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const tenantId = session?.tenantId;
  const canAdjust = hasPermission(session, "inventory.adjust");
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<InventoryMutationValues>({
    resolver: zodResolver(inventoryMutationSchema),
    defaultValues: { operation: "stock-in", quantity: 1 },
  });
  const operation = watch("operation");
  const warehousesQuery = useQuery({
    queryKey: tenantId
      ? warehouseKeys.all(tenantId)
      : ["warehouses", "unauthenticated"],
    queryFn: () => getWarehouses(token as string),
    enabled: Boolean(token && tenantId && canAdjust),
    staleTime: 60_000,
  });
  const mutation = useMutation({
    mutationFn: (values: InventoryMutationValues) => {
      if (!token) throw new Error("Authentication required");
      const input = {
        inventoryItemId: values.inventoryItemId,
        warehouseId: values.warehouseId,
        quantity: values.quantity,
        note: values.note ?? "",
      };
      if (values.operation === "stock-in")
        return stockInInventory(token, input);
      if (values.operation === "waste") return wasteInventory(token, input);
      return adjustInventory(token, input);
    },
    retry: 0,
    onSuccess: async () => {
      if (tenantId) {
        await queryClient.invalidateQueries({
          queryKey: inventoryKeys.list(tenantId),
        });
        await queryClient.invalidateQueries({
          queryKey: inventoryKeys.all(tenantId),
        });
        await queryClient.invalidateQueries({
          queryKey: inventoryKeys.history(tenantId),
        });
        await queryClient.invalidateQueries({
          queryKey: inventoryKeys.stockBalancesForTenant(tenantId),
        });
      }
      setServerError(null);
      reset({ operation, quantity: 1 });
      onSaved();
    },
    onError: (cause) =>
      setServerError(
        cause instanceof ApiError
          ? `${cause.message} If the request timed out, refresh history before retrying.`
          : "The inventory operation result is unknown. Refresh history before retrying.",
      ),
  });

  if (!canAdjust) return null;
  const warehouses = warehousesQuery.data ?? [];
  const activeWarehouses = warehouses.filter((warehouse) => warehouse.isActive);
  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      className="grid gap-4 md:grid-cols-2"
      noValidate
    >
      <label className="text-sm font-medium text-foreground">
        Operation
        <select
          {...register("operation")}
          className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3"
        >
          <option value="stock-in">Stock in</option>
          <option value="adjustment">Adjustment delta</option>
          <option value="waste">Waste</option>
        </select>
      </label>
      <label className="text-sm font-medium text-foreground">
        Inventory item
        <select
          {...register("inventoryItemId")}
          className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3"
        >
          <option value="">Select item</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.code})
            </option>
          ))}
        </select>
        {errors.inventoryItemId ? (
          <span className="mt-1 block text-xs text-destructive">
            {errors.inventoryItemId.message}
          </span>
        ) : null}
      </label>
      <label className="text-sm font-medium text-foreground">
        Warehouse
        <select
          {...register("warehouseId")}
          className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3"
        >
          <option value="">Select warehouse</option>
          {activeWarehouses.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.name} ({warehouse.code})
            </option>
          ))}
        </select>
        {errors.warehouseId ? (
          <span className="mt-1 block text-xs text-destructive">
            {errors.warehouseId.message}
          </span>
        ) : null}
      </label>
      <label className="text-sm font-medium text-foreground">
        Quantity
        <input
          {...register("quantity", { valueAsNumber: true })}
          type="number"
          step="1"
          className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3"
        />
        {errors.quantity ? (
          <span className="mt-1 block text-xs text-destructive">
            {errors.quantity.message}
          </span>
        ) : null}
      </label>
      <label className="text-sm font-medium text-foreground md:col-span-2">
        Note
        <textarea
          {...register("note")}
          rows={2}
          className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2"
        />
        {errors.note ? (
          <span className="mt-1 block text-xs text-destructive">
            {errors.note.message}
          </span>
        ) : null}
      </label>
      {serverError ? (
        <p role="alert" className="text-sm text-destructive md:col-span-2">
          {serverError}
        </p>
      ) : null}
      <div className="md:col-span-2">
        <Button
          type="submit"
          disabled={
            mutation.isPending ||
            warehousesQuery.isPending ||
            !activeWarehouses.length
          }
        >
          {mutation.isPending ? "Applying..." : "Apply inventory operation"}
        </Button>
      </div>
    </form>
  );
}
