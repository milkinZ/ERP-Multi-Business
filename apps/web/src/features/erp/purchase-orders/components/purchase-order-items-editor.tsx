"use client";

import React from "react";
import {
  useFieldArray,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
  type UseFormWatch,
} from "react-hook-form";
import type { InventoryItem } from "@/features/erp/inventory/api/queries";
import type { SupplierItemOffer } from "@/features/erp/suppliers/api/queries";
import type {
  PurchaseOrderFormInput,
  PurchaseOrderFormValues,
} from "@/features/erp/purchase-orders/schemas/purchase-order.schema";

export function PurchaseOrderItemsEditor({
  control,
  register,
  errors,
  inventoryItems,
  supplierOffers,
  setValue,
  watch,
}: {
  control: Control<PurchaseOrderFormInput, unknown, PurchaseOrderFormValues>;
  register: UseFormRegister<PurchaseOrderFormInput>;
  errors: FieldErrors<PurchaseOrderFormInput>;
  inventoryItems: InventoryItem[];
  supplierOffers: SupplierItemOffer[];
  setValue: UseFormSetValue<PurchaseOrderFormInput>;
  watch: UseFormWatch<PurchaseOrderFormInput>;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });

  return (
    <div className="space-y-3">
      {fields.map((field, index) => {
        const error = errors.items?.[index];
        const itemId = watch(`items.${index}.inventoryItemId`);
        const itemOffers = supplierOffers.filter(
          (offer) => offer.inventoryItemId === itemId,
        );

        return (
          <div
            key={field.id}
            className="rounded-2xl border border-border bg-muted/30 p-3"
          >
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_9rem_auto] sm:items-end">
              <label className="block text-sm font-medium text-foreground">
                Inventory item
                <select
                  {...register(`items.${index}.inventoryItemId`)}
                  className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select item</option>
                  {inventoryItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.code}, {item.unit ?? "unit not set"})
                    </option>
                  ))}
                </select>
                {error?.inventoryItemId ? (
                  <span className="mt-1 block text-xs text-destructive">
                    {error.inventoryItemId.message}
                  </span>
                ) : null}
              </label>
              <label className="block text-sm font-medium text-foreground">
                Quantity
                <input
                  {...register(`items.${index}.quantity`, {
                    valueAsNumber: true,
                  })}
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                />
                {error?.quantity ? (
                  <span className="mt-1 block text-xs text-destructive">
                    {error.quantity.message}
                  </span>
                ) : null}
              </label>
              <label className="block text-sm font-medium text-foreground">
                Unit price (tenant base currency)
                <input
                  {...register(`items.${index}.unitPrice`, {
                    valueAsNumber: true,
                  })}
                  type="number"
                  min="0"
                  step="0.000001"
                  className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                />
                {error?.unitPrice ? (
                  <span className="mt-1 block text-xs text-destructive">
                    {error.unitPrice.message}
                  </span>
                ) : null}
              </label>
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={`Remove purchase order item ${index + 1}`}
                className="h-11 rounded-xl border border-border px-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:bg-muted"
              >
                Remove
              </button>
            </div>
            {itemOffers.length ? (
              <label className="mt-3 block text-sm font-medium text-foreground">
                Current supplier offer
                <select
                  defaultValue=""
                  onChange={(event) => {
                    const offer = itemOffers.find(
                      (candidate) => candidate.id === event.target.value,
                    );
                    if (offer) {
                      setValue(
                        `items.${index}.unitPrice`,
                        Number(offer.unitPrice),
                        { shouldDirty: true, shouldValidate: true },
                      );
                    }
                  }}
                  className="mt-2 h-10 w-full rounded-xl border border-border bg-card px-3"
                >
                  <option value="">Keep manually entered price</option>
                  {itemOffers.map((offer) => (
                    <option key={offer.id} value={offer.id}>
                      {offer.supplierSku ? `${offer.supplierSku} · ` : ""}
                      {Number(offer.unitPrice).toFixed(6)} {offer.currencyCode}{" "}
                      per {offer.unit}
                      {offer.minimumOrderQuantity
                        ? ` · minimum ${offer.minimumOrderQuantity}`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() =>
          append({ inventoryItemId: "", quantity: 1, unitPrice: 0 })
        }
        className="rounded-xl border border-dashed border-primary px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary hover:bg-primary/10"
      >
        Add item
      </button>
      {typeof errors.items?.message === "string" ? (
        <p role="alert" className="text-sm text-destructive">
          {errors.items.message}
        </p>
      ) : null}
    </div>
  );
}
