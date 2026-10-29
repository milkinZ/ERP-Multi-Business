"use client"

import React from "react"
import { useFieldArray, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form"

import type { Ingredient } from "@/features/erp/ingredients/api/queries"
import type { RecipeFormValues } from "@/features/erp/recipes/schemas/recipe.schema"

export function RecipeItemsEditor({
  control,
  register,
  errors,
  ingredients,
}: {
  control: Control<RecipeFormValues>
  register: UseFormRegister<RecipeFormValues>
  errors: FieldErrors<RecipeFormValues>
  ingredients: Ingredient[]
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "items" })

  return (
    <div className="space-y-3">
      {fields.map((field, index) => {
        const itemError = errors.items?.[index]
        return (
          <div key={field.id} className="rounded-2xl border border-border bg-muted/30 p-3">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-end">
              <label className="block text-sm font-medium text-foreground">
                Ingredient
                <select {...register(`items.${index}.inventoryItemId`)} aria-invalid={Boolean(itemError?.inventoryItemId)} className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring">
                  <option value="">Select ingredient</option>
                  {ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} ({ingredient.unit})</option>)}
                </select>
                {itemError?.inventoryItemId ? <span className="mt-1 block text-xs text-destructive">{itemError.inventoryItemId.message}</span> : null}
              </label>
              <label className="block text-sm font-medium text-foreground">
                Quantity
                <input {...register(`items.${index}.quantity`, { valueAsNumber: true })} type="number" min="1" step="1" inputMode="numeric" aria-invalid={Boolean(itemError?.quantity)} className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring" />
                {itemError?.quantity ? <span className="mt-1 block text-xs text-destructive">{itemError.quantity.message}</span> : null}
              </label>
              <button type="button" onClick={() => remove(index)} className="h-11 rounded-xl border border-border px-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={`Remove ingredient row ${index + 1}`}>Remove</button>
            </div>
          </div>
        )
      })}
      <button type="button" onClick={() => append({ inventoryItemId: "", quantity: 1 })} className="rounded-xl border border-dashed border-primary px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary transition hover:bg-primary/10">Add ingredient</button>
      {typeof errors.items?.message === "string" ? <p role="alert" className="text-sm text-destructive">{errors.items.message}</p> : null}
    </div>
  )
}
