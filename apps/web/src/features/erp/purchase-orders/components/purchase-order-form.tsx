"use client";

import React, { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import type { InventoryItem } from "@/features/erp/inventory/api/queries";
import type { Supplier } from "@/features/erp/suppliers/api/queries";
import type { Warehouse } from "@/features/erp/warehouses/api/queries";
import {
  createPurchaseOrder,
  purchaseOrderKeys,
  updatePurchaseOrder,
  type PurchaseOrder,
} from "@/features/erp/purchase-orders/api/queries";
import { PurchaseOrderItemsEditor } from "@/features/erp/purchase-orders/components/purchase-order-items-editor";
import {
  purchaseOrderSchema,
  type PurchaseOrderFormValues,
} from "@/features/erp/purchase-orders/schemas/purchase-order.schema";
import { useAuthStore } from "@/stores/auth.store";

export function PurchaseOrderForm({
  purchaseOrder,
  suppliers,
  warehouses,
  inventoryItems,
  onSaved,
}: {
  purchaseOrder?: PurchaseOrder;
  suppliers: Supplier[];
  warehouses: Warehouse[];
  inventoryItems: InventoryItem[];
  onSaved: (id: string) => void;
}) {
  const token = useAuthStore((state) => state.accessToken);
  const tenantId = useAuthStore((state) => state.session?.tenantId);
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const isEditing = Boolean(purchaseOrder);
  const selectableSuppliers = suppliers.filter(
    (supplier) =>
      supplier.isActive || supplier.id === purchaseOrder?.supplierId,
  );
  const selectableWarehouses = warehouses.filter(
    (warehouse) =>
      warehouse.isActive || warehouse.id === purchaseOrder?.warehouseId,
  );
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<PurchaseOrderFormValues>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: {
      supplierId: purchaseOrder?.supplierId ?? "",
      warehouseId: purchaseOrder?.warehouseId ?? "",
      expectedDeliveryDate:
        purchaseOrder?.expectedDeliveryDate?.slice(0, 10) ?? "",
      notes: purchaseOrder?.notes ?? "",
      items: purchaseOrder?.PurchaseOrderItem.map((item) => ({
        inventoryItemId: item.inventoryItemId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })) ?? [{ inventoryItemId: "", quantity: 1, unitPrice: 0 }],
    },
  });
  const mutation = useMutation({
    mutationFn: (values: PurchaseOrderFormValues) => {
      if (!token) throw new Error("Authentication required");
      const input = {
        supplierId: values.supplierId,
        warehouseId: values.warehouseId || undefined,
        expectedDeliveryDate: values.expectedDeliveryDate || undefined,
        notes: values.notes || undefined,
        items: values.items,
      };
      return purchaseOrder
        ? updatePurchaseOrder(token, purchaseOrder.id, input)
        : createPurchaseOrder(token, input);
    },
    retry: 0,
    onSuccess: async (saved) => {
      if (tenantId) {
        await queryClient.invalidateQueries({
          queryKey: purchaseOrderKeys.all(tenantId),
        });
        await queryClient.invalidateQueries({
          queryKey: purchaseOrderKeys.detail(tenantId, saved.id),
        });
      }
      setServerError(null);
      onSaved(saved.id);
    },
    onError: (cause) => {
      setServerError(
        cause instanceof ApiError &&
          (cause.status === 400 || cause.status === 409)
          ? "The Purchase Order could not be saved. Check ownership, lifecycle, quantities, and prices."
          : cause instanceof ApiError && cause.status === 403
            ? `You do not have permission to ${isEditing ? "update" : "create"} Purchase Orders.`
            : cause instanceof Error
              ? cause.message
              : "Unable to save Purchase Order",
      );
    },
  });
  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      className="space-y-5"
      noValidate
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-medium text-foreground">
          Supplier
          <select
            {...register("supplierId")}
            className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          >
            <option value="">Select supplier</option>
            {selectableSuppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
                {supplier.isActive ? "" : " (inactive historical supplier)"}
              </option>
            ))}
          </select>
          {errors.supplierId ? (
            <span className="mt-1 block text-xs text-destructive">
              {errors.supplierId.message}
            </span>
          ) : null}
        </label>
        <label className="block text-sm font-medium text-foreground">
          Warehouse{" "}
          <span className="font-normal text-muted-foreground">
            (optional until receiving)
          </span>
          <select
            {...register("warehouseId")}
            className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          >
            <option value="">No warehouse selected</option>
            {selectableWarehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name} ({warehouse.code})
                {warehouse.isActive ? "" : " (inactive historical warehouse)"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-medium text-foreground">
          Expected delivery date
          <input
            {...register("expectedDeliveryDate")}
            type="date"
            className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="block text-sm font-medium text-foreground">
          Notes
          <textarea
            {...register("notes")}
            rows={2}
            className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </label>
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">Line items</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Prices and totals are submitted to and calculated by the backend.
          Receiving is a separate status command.
        </p>
        <div className="mt-3">
          <PurchaseOrderItemsEditor
            control={control}
            register={register}
            errors={errors}
            inventoryItems={inventoryItems}
          />
        </div>
      </div>
      {serverError ? (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={
          mutation.isPending ||
          !token ||
          !suppliers.length ||
          !inventoryItems.length
        }
        className="w-full"
      >
        {mutation.isPending
          ? isEditing
            ? "Saving Purchase Order..."
            : "Creating Purchase Order..."
          : isEditing
            ? "Save Purchase Order"
            : "Create Purchase Order"}
      </Button>
    </form>
  );
}
