"use client"

import React, { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api/client"
import {
  productKeys,
  updateProductKitchenSettings,
  type Product,
} from "@/features/erp/products/api/queries"
import { useAuthStore } from "@/stores/auth.store"

export function ProductKitchenSettingsForm({ product }: { product: Product }) {
  const token = useAuthStore((state) => state.accessToken)
  const tenantId = useAuthStore((state) => state.session?.tenantId)
  const queryClient = useQueryClient()
  const [category, setCategory] = useState(product.kitchenCategory ?? "")
  const [prepTime, setPrepTime] = useState(
    product.kitchenPrepTimeMinutes?.toString() ?? "",
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setCategory(product.kitchenCategory ?? "")
    setPrepTime(product.kitchenPrepTimeMinutes?.toString() ?? "")
  }, [product.kitchenCategory, product.kitchenPrepTimeMinutes])

  const mutation = useMutation({
    mutationFn: () => {
      if (!token) throw new Error("Authentication required")
      const parsedPrepTime = prepTime === "" ? null : Number(prepTime)
      if (
        parsedPrepTime !== null &&
        (!Number.isSafeInteger(parsedPrepTime) ||
          parsedPrepTime < 1 ||
          parsedPrepTime > 1440)
      ) {
        throw new Error("Preparation target must be between 1 and 1440 minutes.")
      }
      return updateProductKitchenSettings(token, product.id, {
        kitchenCategory: category.trim() || null,
        kitchenPrepTimeMinutes: parsedPrepTime,
      })
    },
    onSuccess: async () => {
      if (tenantId) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: productKeys.detail(tenantId, product.id),
          }),
          queryClient.invalidateQueries({
            queryKey: productKeys.all(tenantId),
          }),
        ])
      }
      setError(null)
    },
    onError: (cause) => {
      setError(
        cause instanceof ApiError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : "Unable to update Kitchen settings.",
      )
    },
  })

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate()
      }}
    >
      <label className="block text-sm font-medium text-foreground">
        Kitchen category
        <input
          value={category}
          maxLength={64}
          onChange={(event) => setCategory(event.target.value)}
          className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3"
        />
      </label>
      <label className="block text-sm font-medium text-foreground">
        Preparation target (minutes)
        <input
          type="number"
          min="1"
          max="1440"
          step="1"
          value={prepTime}
          onChange={(event) => setPrepTime(event.target.value)}
          className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3"
        />
      </label>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={mutation.isPending || !token}>
        {mutation.isPending ? "Saving..." : "Save Kitchen settings"}
      </Button>
    </form>
  )
}
