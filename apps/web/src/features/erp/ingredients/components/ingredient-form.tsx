"use client"

import React, { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { ApiError } from "@/lib/api/client"
import { Button } from "@/components/ui/button"
import { createIngredient, ingredientKeys } from "@/features/erp/ingredients/api/queries"
import { ingredientSchema, type IngredientFormValues } from "@/features/erp/ingredients/schemas/ingredient.schema"
import { useAuthStore } from "@/stores/auth.store"

export function IngredientForm({ onCreated }: { onCreated: () => void }) {
  const token = useAuthStore((state) => state.accessToken)
  const tenantId = useAuthStore((state) => state.session?.tenantId)
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)
  const { register, handleSubmit, reset, formState: { errors } } = useForm<IngredientFormValues>({
    resolver: zodResolver(ingredientSchema),
    defaultValues: { name: "", unit: "" },
  })

  const mutation = useMutation({
    mutationFn: (values: IngredientFormValues) => {
      if (!token) throw new Error("Authentication required")
      return createIngredient(token, values)
    },
    retry: 0,
    onSuccess: async () => {
      if (tenantId) await queryClient.invalidateQueries({ queryKey: ingredientKeys.all(tenantId) })
      await queryClient.invalidateQueries({ queryKey: ["inventory"] })
      reset()
      setServerError(null)
      onCreated()
    },
    onError: (cause) => {
      if (cause instanceof ApiError && cause.status === 403) {
        setServerError("You do not have permission to create ingredients.")
        return
      }
      if (cause instanceof ApiError && cause.status === 400) {
        setServerError("The ingredient could not be created. Check the name and unit, then try again.")
        return
      }
      setServerError(cause instanceof Error ? cause.message : "Unable to create ingredient")
    },
  })

  return (
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4" noValidate>
      <label className="block text-sm font-medium text-foreground">
        Name
        <input {...register("name")} aria-invalid={Boolean(errors.name)} className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring" />
        {errors.name ? <span className="mt-1 block text-xs text-destructive">{errors.name.message}</span> : null}
      </label>
      <label className="block text-sm font-medium text-foreground">
        Unit
        <input {...register("unit")} aria-invalid={Boolean(errors.unit)} className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring" />
        {errors.unit ? <span className="mt-1 block text-xs text-destructive">{errors.unit.message}</span> : null}
      </label>
      {serverError ? <p role="alert" className="text-sm text-destructive">{serverError}</p> : null}
      <Button type="submit" disabled={mutation.isPending || !token} className="w-full">
        {mutation.isPending ? "Creating ingredient..." : "Create ingredient"}
      </Button>
    </form>
  )
}
