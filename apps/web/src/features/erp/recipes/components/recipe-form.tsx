"use client"

import React, { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { ApiError } from "@/lib/api/client"
import { Button } from "@/components/ui/button"
import type { Ingredient } from "@/features/erp/ingredients/api/queries"
import { createRecipe, recipeKeys } from "@/features/erp/recipes/api/queries"
import { RecipeItemsEditor } from "@/features/erp/recipes/components/recipe-items-editor"
import { recipeSchema, type RecipeFormValues } from "@/features/erp/recipes/schemas/recipe.schema"
import type { Product } from "@/features/erp/products/api/queries"
import { useAuthStore } from "@/stores/auth.store"

export function RecipeForm({ products, ingredients, onCreated }: { products: Product[]; ingredients: Ingredient[]; onCreated: (productId: string) => void }) {
  const token = useAuthStore((state) => state.accessToken)
  const tenantId = useAuthStore((state) => state.session?.tenantId)
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)
  const { register, control, handleSubmit, formState: { errors } } = useForm<RecipeFormValues>({
    resolver: zodResolver(recipeSchema),
    defaultValues: { productId: "", items: [{ ingredientId: "", quantity: 1 }] },
  })

  const mutation = useMutation({
    mutationFn: (values: RecipeFormValues) => {
      if (!token) throw new Error("Authentication required")
      return createRecipe(token, values)
    },
    retry: 0,
    onSuccess: async (recipe) => {
      if (tenantId) await queryClient.invalidateQueries({ queryKey: recipeKeys.byProduct(tenantId, recipe.productId) })
      setServerError(null)
      onCreated(recipe.productId)
    },
    onError: (cause) => {
      if (cause instanceof ApiError && cause.status === 403) {
        setServerError("You do not have permission to create recipes.")
        return
      }
      if (cause instanceof ApiError && (cause.status === 400 || cause.status === 409)) {
        setServerError("The recipe could not be created. Check the product, ingredients, and quantities, then try again.")
        return
      }
      setServerError(cause instanceof Error ? cause.message : "Unable to create recipe")
    },
  })

  return (
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-5" noValidate>
      <label className="block text-sm font-medium text-foreground">
        Product
        <select {...register("productId")} aria-invalid={Boolean(errors.productId)} className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring">
          <option value="">Select product</option>
          {products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` (${product.sku})` : ""}</option>)}
        </select>
        {errors.productId ? <span className="mt-1 block text-xs text-destructive">{errors.productId.message}</span> : null}
      </label>
      <div>
        <p className="text-sm font-medium text-foreground">Recipe ingredients</p>
        <p className="mt-1 text-xs text-muted-foreground">Quantities are submitted as positive whole numbers, matching the backend contract. Units are displayed from Ingredients but are not sent because the DTO does not accept them.</p>
        <div className="mt-3"><RecipeItemsEditor control={control} register={register} errors={errors} ingredients={ingredients} /></div>
      </div>
      {serverError ? <p role="alert" className="text-sm text-destructive">{serverError}</p> : null}
      <Button type="submit" disabled={mutation.isPending || !token || !products.length || !ingredients.length} className="w-full">{mutation.isPending ? "Creating recipe..." : "Create recipe"}</Button>
    </form>
  )
}
