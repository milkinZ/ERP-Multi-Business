"use client"

import React from "react"
import { useFieldArray, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form"
import type { InventoryItem } from "@/features/erp/inventory/api/queries"
import type { PurchaseOrderFormValues } from "@/features/erp/purchase-orders/schemas/purchase-order.schema"

export function PurchaseOrderItemsEditor({ control, register, errors, inventoryItems }: { control: Control<PurchaseOrderFormValues>; register: UseFormRegister<PurchaseOrderFormValues>; errors: FieldErrors<PurchaseOrderFormValues>; inventoryItems: InventoryItem[] }) {
  const { fields, append, remove } = useFieldArray({ control, name: "items" })
  return <div className="space-y-3">
    {fields.map((field, index) => {
      const error = errors.items?.[index]
      return <div key={field.id} className="rounded-2xl border border-border bg-muted/30 p-3"><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_9rem_auto] sm:items-end">
        <label className="block text-sm font-medium text-foreground">Inventory item<select {...register(`items.${index}.inventoryItemId`)} className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring"><option value="">Select item</option>{inventoryItems.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}</select>{error?.inventoryItemId ? <span className="mt-1 block text-xs text-destructive">{error.inventoryItemId.message}</span> : null}</label>
        <label className="block text-sm font-medium text-foreground">Quantity<input {...register(`items.${index}.quantity`, { valueAsNumber: true })} type="number" min="1" step="1" className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring" />{error?.quantity ? <span className="mt-1 block text-xs text-destructive">{error.quantity.message}</span> : null}</label>
        <label className="block text-sm font-medium text-foreground">Unit price (tenant base currency)<input {...register(`items.${index}.unitPrice`, { valueAsNumber: true })} type="number" min="0" step="1" className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring" />{error?.unitPrice ? <span className="mt-1 block text-xs text-destructive">{error.unitPrice.message}</span> : null}</label>
        <button type="button" onClick={() => remove(index)} aria-label={`Remove purchase order item ${index + 1}`} className="h-11 rounded-xl border border-border px-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:bg-muted">Remove</button>
      </div></div>
    })}
    <button type="button" onClick={() => append({ inventoryItemId: "", quantity: 1, unitPrice: 0 })} className="rounded-xl border border-dashed border-primary px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary hover:bg-primary/10">Add item</button>
    {typeof errors.items?.message === "string" ? <p role="alert" className="text-sm text-destructive">{errors.items.message}</p> : null}
  </div>
}
