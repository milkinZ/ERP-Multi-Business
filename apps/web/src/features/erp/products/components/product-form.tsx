"use client"

import React, { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { ApiError } from "@/lib/api/client"
import { useAuthStore } from "@/stores/auth.store"
import { Button } from "@/components/ui/button"
import { createProduct, productKeys } from "@/features/erp/products/api/queries"
import { productSchema, type ProductFormValues } from "@/features/erp/products/schemas/product.schema"

export function ProductForm({ onCreated }: { onCreated: () => void }) {
  const token = useAuthStore((state) => state.accessToken)
  const tenantId = useAuthStore((state) => state.session?.tenantId)
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: "", description: "", sku: "", price: 0 },
  })

  const mutation = useMutation({
    mutationFn: (values: ProductFormValues) => {
      if (!token) throw new Error("Authentication required")
      return createProduct(token, {
        name: values.name,
        description: values.description || undefined,
        sku: values.sku || undefined,
        price: values.price,
      })
    },
    onSuccess: async (product) => {
      if (tenantId) {
        await queryClient.invalidateQueries({ queryKey: productKeys.all(tenantId) })
        await queryClient.invalidateQueries({ queryKey: productKeys.detail(tenantId, product.id) })
      }
      await queryClient.invalidateQueries({ queryKey: ["inventory"] })
      await queryClient.invalidateQueries({ queryKey: ["erp-dashboard"] })
      reset()
      setServerError(null)
      onCreated()
    },
    onError: (cause) => {
      if (cause instanceof ApiError && cause.status === 403) {
        setServerError("You do not have permission to create products.")
        return
      }
      setServerError(cause instanceof Error ? cause.message : "Unable to create product")
    },
  })

  return (
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4" noValidate>
      <label className="block text-sm font-medium text-[var(--foreground)]">
        Name
        <input {...register("name")} aria-invalid={Boolean(errors.name)} className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]" />
        {errors.name && <span className="mt-1 block text-xs text-[var(--danger)]">{errors.name.message}</span>}
      </label>
      <label className="block text-sm font-medium text-[var(--foreground)]">
        SKU <span className="font-normal text-[var(--muted-foreground)]">(optional)</span>
        <input {...register("sku")} aria-invalid={Boolean(errors.sku)} className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]" />
        {errors.sku && <span className="mt-1 block text-xs text-[var(--danger)]">{errors.sku.message}</span>}
      </label>
      <label className="block text-sm font-medium text-[var(--foreground)]">
        Price
        <input {...register("price", { valueAsNumber: true })} type="number" min="0" step="1" aria-invalid={Boolean(errors.price)} className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]" />
        <span className="mt-1 block text-xs font-normal text-[var(--muted-foreground)]">Submitted as the backend integer price value.</span>
        {errors.price && <span className="mt-1 block text-xs text-[var(--danger)]">{errors.price.message}</span>}
      </label>
      <label className="block text-sm font-medium text-[var(--foreground)]">
        Description <span className="font-normal text-[var(--muted-foreground)]">(optional)</span>
        <textarea {...register("description")} rows={3} className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]" />
      </label>
      {serverError && <p role="alert" className="text-sm text-[var(--danger)]">{serverError}</p>}
      <Button type="submit" disabled={mutation.isPending || !token} className="w-full">{mutation.isPending ? "Creating product..." : "Create product"}</Button>
    </form>
  )
}