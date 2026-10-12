"use client"

import React, { useEffect, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { ApiError } from "@/lib/api/client"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/stores/auth.store"
import { createOutlet, outletKeys, updateOutlet, type Outlet } from "@/features/erp/outlets/api/queries"
import { outletSchema, type OutletFormValues } from "@/features/erp/outlets/schemas/outlet.schema"

export function OutletForm({ outlet, onSaved }: { outlet?: Outlet; onSaved: (saved: Outlet) => void }) {
  const token = useAuthStore((state) => state.accessToken)
  const tenantId = useAuthStore((state) => state.session?.tenantId)
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)
  const { register, handleSubmit, reset, formState: { errors } } = useForm<OutletFormValues>({ resolver: zodResolver(outletSchema), defaultValues: { name: outlet?.name ?? "" } })

  useEffect(() => { reset({ name: outlet?.name ?? "" }) }, [outlet, reset])

  const mutation = useMutation({
    mutationFn: (values: OutletFormValues) => {
      if (!token) throw new Error("Authentication required")
      return outlet ? updateOutlet(token, outlet.id, values) : createOutlet(token, values)
    },
    retry: 0,
    onSuccess: async (saved) => {
      if (tenantId) {
        await queryClient.invalidateQueries({ queryKey: outletKeys.all(tenantId) })
        await queryClient.invalidateQueries({ queryKey: outletKeys.detail(tenantId, saved.id) })
      }
      setServerError(null)
      reset({ name: saved.name })
      onSaved(saved)
    },
    onError: (cause) => setServerError(cause instanceof ApiError && cause.status === 403 ? "You do not have permission to manage outlets." : cause instanceof Error ? cause.message : "Unable to save outlet"),
  })

  return <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4" noValidate><label className="block text-sm font-medium text-foreground">Outlet name<input {...register("name")} aria-invalid={Boolean(errors.name)} className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring" />{errors.name ? <span className="mt-1 block text-xs text-destructive">{errors.name.message}</span> : null}</label>{serverError ? <p role="alert" className="text-sm text-destructive">{serverError}</p> : null}<Button type="submit" disabled={mutation.isPending || !token}>{mutation.isPending ? "Saving outlet..." : outlet ? "Save outlet" : "Create outlet"}</Button></form>
}
