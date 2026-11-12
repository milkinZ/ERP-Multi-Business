"use client";

import React, { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/stores/auth.store";
import { Button } from "@/components/ui/button";
import {
  createProduct,
  productKeys,
} from "@/features/erp/products/api/queries";
import type { ProductStockMode } from "@/features/erp/products/api/queries";
import {
  productSchema,
  type ProductFormInput,
  type ProductFormValues,
} from "@/features/erp/products/schemas/product.schema";

export function ProductForm({
  onCreated,
  defaultStockMode,
  businessType,
}: {
  onCreated: () => void;
  defaultStockMode: ProductStockMode;
  businessType: string;
}) {
  const token = useAuthStore((state) => state.accessToken);
  const tenantId = useAuthStore((state) => state.session?.tenantId);
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      description: "",
      sku: "",
      price: 0,
      stockMode: defaultStockMode,
      inventoryUnit: defaultStockMode === "INVENTORY_ITEM" ? "PCS" : "",
      kitchenCategory: "",
      kitchenPrepTimeMinutes: undefined,
    },
  });
  const stockMode = watch("stockMode");
  const supportsRecipes = businessType === "CAFE";

  const mutation = useMutation({
    mutationFn: (values: ProductFormValues) => {
      if (!token) throw new Error("Authentication required");
      return createProduct(token, {
        name: values.name,
        description: values.description || undefined,
        sku: values.sku || undefined,
        stockMode: values.stockMode,
        inventoryUnit:
          values.stockMode === "INVENTORY_ITEM"
            ? values.inventoryUnit
            : undefined,
        kitchenCategory: values.kitchenCategory || undefined,
        kitchenPrepTimeMinutes: values.kitchenPrepTimeMinutes,
        price: values.price,
      });
    },
    onSuccess: async (product) => {
      if (tenantId) {
        await queryClient.invalidateQueries({
          queryKey: productKeys.all(tenantId),
        });
        await queryClient.invalidateQueries({
          queryKey: productKeys.detail(tenantId, product.id),
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
      await queryClient.invalidateQueries({ queryKey: ["erp-dashboard"] });
      reset();
      setServerError(null);
      onCreated();
    },
    onError: (cause) => {
      if (cause instanceof ApiError && cause.status === 403) {
        setServerError("You do not have permission to create products.");
        return;
      }
      setServerError(
        cause instanceof Error ? cause.message : "Unable to create product",
      );
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      className="space-y-4"
      noValidate
    >
      <label className="block text-sm font-medium text-[var(--foreground)]">
        Name
        <input
          {...register("name")}
          aria-invalid={Boolean(errors.name)}
          className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
        />
        {errors.name && (
          <span className="mt-1 block text-xs text-[var(--danger)]">
            {errors.name.message}
          </span>
        )}
      </label>
      <label className="block text-sm font-medium text-[var(--foreground)]">
        SKU{" "}
        <span className="font-normal text-[var(--muted-foreground)]">
          (optional)
        </span>
        <input
          {...register("sku")}
          aria-invalid={Boolean(errors.sku)}
          className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
        />
        {errors.sku && (
          <span className="mt-1 block text-xs text-[var(--danger)]">
            {errors.sku.message}
          </span>
        )}
      </label>
      <label className="block text-sm font-medium text-[var(--foreground)]">
        Stock policy
        <select
          {...register("stockMode")}
          className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
        >
          <option value="INVENTORY_ITEM">
            Track finished product inventory
          </option>
          {supportsRecipes ? (
            <option value="RECIPE">Consume ingredients from a recipe</option>
          ) : null}
          <option value="UNTRACKED">Do not track stock</option>
        </select>
        <span className="mt-1 block text-xs font-normal text-[var(--muted-foreground)]">
          {stockMode === "RECIPE"
            ? "An active recipe with valid ingredients is required before this menu item can be sold."
            : stockMode === "INVENTORY_ITEM"
              ? "Stock changes only through inventory movements; creating this product does not create starting stock."
              : "No inventory movement is created for this product."}
        </span>
      </label>
      {stockMode === "INVENTORY_ITEM" ? (
        <label className="block text-sm font-medium text-[var(--foreground)]">
          Inventory unit
          <input
            {...register("inventoryUnit")}
            maxLength={32}
            placeholder="PCS"
            aria-invalid={Boolean(errors.inventoryUnit)}
            className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
          />
          {errors.inventoryUnit && (
            <span className="mt-1 block text-xs text-[var(--danger)]">
              {errors.inventoryUnit.message}
            </span>
          )}
        </label>
      ) : null}
      <label className="block text-sm font-medium text-[var(--foreground)]">
        Price
        <input
          {...register("price", { valueAsNumber: true })}
          type="number"
          min="0"
          step="1"
          aria-invalid={Boolean(errors.price)}
          className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
        />
        <span className="mt-1 block text-xs font-normal text-[var(--muted-foreground)]">
          Submitted as the backend integer price value.
        </span>
        {errors.price && (
          <span className="mt-1 block text-xs text-[var(--danger)]">
            {errors.price.message}
          </span>
        )}
      </label>
      <label className="block text-sm font-medium text-[var(--foreground)]">
        Kitchen category{" "}
        <span className="font-normal text-[var(--muted-foreground)]">
          (optional)
        </span>
        <input
          {...register("kitchenCategory")}
          maxLength={64}
          className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
        />
        <span className="mt-1 block text-xs font-normal text-[var(--muted-foreground)]">
          Matches an outlet station routing rule.
        </span>
        {errors.kitchenCategory && (
          <span className="mt-1 block text-xs text-[var(--danger)]">
            {errors.kitchenCategory.message}
          </span>
        )}
      </label>
      <label className="block text-sm font-medium text-[var(--foreground)]">
        Preparation target (minutes){" "}
        <span className="font-normal text-[var(--muted-foreground)]">
          (optional)
        </span>
        <input
          {...register("kitchenPrepTimeMinutes", {
            setValueAs: (value) => (value === "" ? undefined : Number(value)),
          })}
          type="number"
          min="1"
          max="1440"
          step="1"
          className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
        />
        <span className="mt-1 block text-xs font-normal text-[var(--muted-foreground)]">
          Used for the per-item timer and station SLA.
        </span>
        {errors.kitchenPrepTimeMinutes && (
          <span className="mt-1 block text-xs text-[var(--danger)]">
            {errors.kitchenPrepTimeMinutes.message}
          </span>
        )}
      </label>
      <label className="block text-sm font-medium text-[var(--foreground)]">
        Description{" "}
        <span className="font-normal text-[var(--muted-foreground)]">
          (optional)
        </span>
        <textarea
          {...register("description")}
          rows={3}
          className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
        />
      </label>
      {serverError && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {serverError}
        </p>
      )}
      <Button
        type="submit"
        disabled={mutation.isPending || !token}
        className="w-full"
      >
        {mutation.isPending ? "Creating product..." : "Create product"}
      </Button>
    </form>
  );
}
