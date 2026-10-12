"use client"

import React, { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { ApiError } from "@/lib/api/client"
import { Button } from "@/components/ui/button"
import { createSupplier, supplierKeys, updateSupplier, type Supplier } from "@/features/erp/suppliers/api/queries"
import { supplierSchema, type SupplierFormValues } from "@/features/erp/suppliers/schemas/supplier.schema"
import { useAuthStore } from "@/stores/auth.store"

export function SupplierForm({ supplier, onSaved }: { supplier?: Supplier; onSaved: (supplierId: string) => void }) {
  const token = useAuthStore((state) => state.accessToken)
  const tenantId = useAuthStore((state) => state.session?.tenantId)
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)
  const isEditing = Boolean(supplier)
  const { register, handleSubmit, formState: { errors } } = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: supplier?.name ?? "",
      phone: supplier?.phone ?? "",
      email: supplier?.email ?? "",
      address: supplier?.address ?? "",
    },
  })

  const mutation = useMutation({
    mutationFn: (values: SupplierFormValues) => {
      if (!token) throw new Error("Authentication required")
      const input = {
        name: values.name,
        phone: values.phone || undefined,
        email: values.email || undefined,
        address: values.address || undefined,
      }
      return supplier ? updateSupplier(token, supplier.id, input) : createSupplier(token, input)
    },
    retry: 0,
    onSuccess: async (saved) => {
      if (tenantId) {
        await queryClient.invalidateQueries({ queryKey: supplierKeys.all(tenantId) })
        await queryClient.invalidateQueries({ queryKey: supplierKeys.detail(tenantId, saved.id) })
      }
      setServerError(null)
      onSaved(saved.id)
    },
    onError: (cause) => {
      if (cause instanceof ApiError && cause.status === 403) {
        setServerError(`You do not have permission to ${isEditing ? "update" : "create"} suppliers.`)
        return
      }
      if (cause instanceof ApiError && (cause.status === 400 || cause.status === 409)) {
        setServerError("The supplier could not be saved. Check the fields and whether the name is already used in this tenant.")
        return
      }
      setServerError(cause instanceof Error ? cause.message : "Unable to save supplier")
    },
  })

  return (
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4" noValidate>
      <label className="block text-sm font-medium text-foreground">
        Name
        <input {...register("name")} aria-invalid={Boolean(errors.name)} className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring" />
        {errors.name ? <span className="mt-1 block text-xs text-destructive">{errors.name.message}</span> : null}
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-foreground">Phone<input {...register("phone")} className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring" />{errors.phone ? <span className="mt-1 block text-xs text-destructive">{errors.phone.message}</span> : null}</label>
        <label className="block text-sm font-medium text-foreground">Email<input {...register("email")} type="email" aria-invalid={Boolean(errors.email)} className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring" />{errors.email ? <span className="mt-1 block text-xs text-destructive">{errors.email.message}</span> : null}</label>
      </div>
      <label className="block text-sm font-medium text-foreground">Address<textarea {...register("address")} rows={3} className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-ring" />{errors.address ? <span className="mt-1 block text-xs text-destructive">{errors.address.message}</span> : null}</label>
      {serverError ? <p role="alert" className="text-sm text-destructive">{serverError}</p> : null}
      <Button type="submit" disabled={mutation.isPending || !token} className="w-full">{mutation.isPending ? (isEditing ? "Saving supplier..." : "Creating supplier...") : (isEditing ? "Save supplier" : "Create supplier")}</Button>
    </form>
  )
}
