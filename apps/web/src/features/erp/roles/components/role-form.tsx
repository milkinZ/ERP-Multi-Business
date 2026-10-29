"use client"

import React, { useEffect, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { ApiError } from "@/lib/api/client"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/stores/auth.store"
import { createRole, roleKeys, updateRole, type Role } from "@/features/erp/roles/api/queries"
import { roleSchema, type RoleFormValues } from "@/features/erp/roles/schemas/role.schema"

export function RoleForm({ role, onSaved }: { role?: Role; onSaved: () => void }) {
  const token = useAuthStore((state) => state.accessToken)
  const tenantId = useAuthStore((state) => state.session?.tenantId)
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)
  const { register, handleSubmit, reset, formState: { errors } } = useForm<RoleFormValues>({
    resolver: zodResolver(roleSchema),
    defaultValues: { name: role?.name ?? "", description: role?.description ?? "" },
  })

  useEffect(() => { reset({ name: role?.name ?? "", description: role?.description ?? "" }) }, [role, reset])

  const mutation = useMutation({
    mutationFn: (values: RoleFormValues) => {
      if (!token) throw new Error("Authentication required")
      return role ? updateRole(token, role.id, values) : createRole(token, values)
    },
    retry: 0,
    onSuccess: async (saved) => {
      if (tenantId) {
        await queryClient.invalidateQueries({ queryKey: roleKeys.all(tenantId) })
        await queryClient.invalidateQueries({ queryKey: roleKeys.detail(tenantId, saved.id) })
      }
      setServerError(null)
      reset({ name: saved.name, description: saved.description ?? "" })
      onSaved()
    },
    onError: (cause) => {
      setServerError(cause instanceof ApiError && cause.status === 403 ? "You do not have permission to manage roles." : cause instanceof Error ? cause.message : "Unable to save role")
    },
  })

  return (
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4" noValidate>
      <label className="block text-sm font-medium text-foreground">Role name<input {...register("name")} aria-invalid={Boolean(errors.name)} className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring" />{errors.name ? <span className="mt-1 block text-xs text-destructive">{errors.name.message}</span> : null}</label>
      <label className="block text-sm font-medium text-foreground">Description<textarea {...register("description")} aria-invalid={Boolean(errors.description)} rows={3} className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-ring" />{errors.description ? <span className="mt-1 block text-xs text-destructive">{errors.description.message}</span> : null}</label>
      {serverError ? <p role="alert" className="text-sm text-destructive">{serverError}</p> : null}
      <Button type="submit" disabled={mutation.isPending || !token}>{mutation.isPending ? "Saving role..." : role ? "Save role" : "Create role"}</Button>
    </form>
  )
}
