"use client";

import React, { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import type { Ingredient } from "@/features/erp/ingredients/api/queries";
import {
  createRecipe,
  recipeKeys,
  updateRecipe,
  type Recipe,
} from "@/features/erp/recipes/api/queries";
import { RecipeItemsEditor } from "@/features/erp/recipes/components/recipe-items-editor";
import {
  recipeSchema,
  type RecipeFormInput,
  type RecipeFormValues,
} from "@/features/erp/recipes/schemas/recipe.schema";
import type { Product } from "@/features/erp/products/api/queries";
import { useAuthStore } from "@/stores/auth.store";

export function RecipeForm({
  products,
  ingredients,
  recipe,
  onCreated,
}: {
  products: Product[];
  ingredients: Ingredient[];
  recipe?: Recipe;
  onCreated: (productId: string) => void;
}) {
  const token = useAuthStore((state) => state.accessToken);
  const tenantId = useAuthStore((state) => state.session?.tenantId);
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RecipeFormInput, unknown, RecipeFormValues>({
    resolver: zodResolver(recipeSchema),
    defaultValues: recipe
      ? {
          productId: recipe.productId,
          items: recipe.RecipeItem.map(
            ({ inventoryItemId, quantity, unit }) => ({
              inventoryItemId,
              quantity,
              unit: unit ?? "",
            }),
          ),
        }
      : { productId: "", items: [{ inventoryItemId: "", quantity: 1 }] },
  });

  useEffect(() => {
    reset(
      recipe
        ? {
            productId: recipe.productId,
            items: recipe.RecipeItem.map(
              ({ inventoryItemId, quantity, unit }) => ({
                inventoryItemId,
                quantity,
                unit: unit ?? "",
              }),
            ),
          }
        : { productId: "", items: [{ inventoryItemId: "", quantity: 1 }] },
    );
  }, [recipe, reset]);

  const mutation = useMutation({
    mutationFn: (values: RecipeFormValues) => {
      if (!token) throw new Error("Authentication required");
      return recipe
        ? updateRecipe(token, recipe.productId, {
            ...values,
            expectedRevision: recipe.revision,
          })
        : createRecipe(token, values);
    },
    retry: 0,
    onSuccess: async (recipe) => {
      if (tenantId)
        await queryClient.invalidateQueries({
          queryKey: recipeKeys.byProduct(tenantId, recipe.productId),
        });
      if (tenantId)
        await queryClient.invalidateQueries({
          queryKey: recipeKeys.list(tenantId, { page: 1, limit: 20 }),
        });
      setServerError(null);
      onCreated(recipe.productId);
    },
    onError: (cause) => {
      if (cause instanceof ApiError && cause.status === 403) {
        setServerError("You do not have permission to create recipes.");
        return;
      }
      if (
        cause instanceof ApiError &&
        (cause.status === 400 || cause.status === 409)
      ) {
        setServerError(
          "The recipe could not be saved. Check the product, ingredients, and quantities, then try again.",
        );
        return;
      }
      setServerError(
        cause instanceof Error ? cause.message : "Unable to create recipe",
      );
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      className="space-y-5"
      noValidate
    >
      <label className="block text-sm font-medium text-foreground">
        Product
        <select
          {...register("productId")}
          disabled={Boolean(recipe)}
          aria-invalid={Boolean(errors.productId)}
          className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-70"
        >
          <option value="">Select product</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
              {product.sku ? ` (${product.sku})` : ""}
            </option>
          ))}
        </select>
        {errors.productId ? (
          <span className="mt-1 block text-xs text-destructive">
            {errors.productId.message}
          </span>
        ) : null}
      </label>
      <div>
        <p className="text-sm font-medium text-foreground">
          Recipe ingredients
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Enter positive quantities with up to six decimal places. Recipe units
          may differ from stock units when a valid tenant or ingredient
          conversion is configured; leave the unit blank to use the stock unit.
        </p>
        <div className="mt-3">
          <RecipeItemsEditor
            control={control}
            register={register}
            errors={errors}
            ingredients={ingredients}
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
          !products.length ||
          !ingredients.length
        }
        className="w-full"
      >
        {mutation.isPending
          ? "Saving recipe..."
          : recipe
            ? "Save recipe"
            : "Create recipe"}
      </Button>
    </form>
  );
}
