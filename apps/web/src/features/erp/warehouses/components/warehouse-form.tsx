"use client"

import React, { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { ApiError } from "@/lib/api/client"
import { Button } from "@/components/ui/button"
import { createWarehouse, warehouseKeys } from "@/features/erp/warehouses/api/queries"
import { warehouseSchema, type WarehouseFormValues } from "@/features/erp/warehouses/schemas/warehouse.schema"
import { useAuthStore } from "@/stores/auth.store"

export function WarehouseForm({ onCreated }: { onCreated: (warehouseId: string) => void }) {
  const token = useAuthStore((state) => state.accessToken)
  const tenantId = useAuthStore((state) => state.session?.tenantId)
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)
  const { register, handleSubmit, reset, formState: { errors } } = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: { name: "", outletId: "" },
  })

  const mutation = useMutation({
    mutationFn: (values: WarehouseFormValues) => {
      if (!token) throw new Error("Authentication required")
      return createWarehouse(token, {
        name: values.name,
        outletId: values.outletId || undefined,
      })
    },
    retry: 0,
    onSuccess: async (warehouse) => {
      if (tenantId) await queryClient.invalidateQueries({ queryKey: warehouseKeys.all(tenantId) })
      await queryClient.invalidateQueries({ queryKey: warehouseKeys.detail(tenantId ?? "", warehouse.id) })
      reset()
      setServerError(null)
      onCreated(warehouse.id)
    },
    onError: (cause) => {
      if (cause instanceof ApiError && cause.status === 403) {
        setServerError("You do not have permission to create warehouses.")
        return
      }
      if (cause instanceof ApiError && (cause.status === 400 || cause.status === 409)) {
        setServerError("The warehouse could not be created. Check the name and outlet reference, then try again.")
        return
      }
      setServerError(cause instanceof Error ? cause.message : "Unable to create warehouse")
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
        Outlet ID <span className="font-normal text-muted-foreground">(optional)</span>
        <input {...register("outletId")} aria-invalid={Boolean(errors.outletId)} className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring" />
        <span className="mt-1 block text-xs font-normal text-muted-foreground">The current Warehouse API accepts an outlet ID but does not expose an outlet selector endpoint here.</span>
        {errors.outletId ? <span className="mt-1 block text-xs text-destructive">{errors.outletId.message}</span> : null}
      </label>
      {serverError ? <p role="alert" className="text-sm text-destructive">{serverError}</p> : null}
      <Button type="submit" disabled={mutation.isPending || !token} className="w-full">
        {mutation.isPending ? "Creating warehouse..." : "Create warehouse"}
      </Button>
    </form>
  )
}
