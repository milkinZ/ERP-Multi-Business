"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { PageHeader, SectionHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { deleteSupplier, getSupplier, supplierKeys } from "@/features/erp/suppliers/api/queries"
import { SupplierForm } from "@/features/erp/suppliers/components/supplier-form"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth.store"

export default function SupplierDetailPage() {
  const { supplierId } = useParams<{ supplierId: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const tenantId = session?.tenantId
  const canRead = hasPermission(session, "supplier.read")
  const canUpdate = hasPermission(session, "supplier.update")
  const canDelete = hasPermission(session, "supplier.delete")
  const [isEditing, setIsEditing] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: tenantId ? supplierKeys.detail(tenantId, supplierId) : ["suppliers", "unauthenticated", supplierId],
    queryFn: () => getSupplier(token as string, supplierId),
    enabled: Boolean(token && tenantId && canRead && supplierId),
    staleTime: 60_000,
  })

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!token) throw new Error("Authentication required")
      return deleteSupplier(token, supplierId)
    },
    retry: 0,
    onSuccess: async () => {
      if (tenantId) {
        await queryClient.invalidateQueries({ queryKey: supplierKeys.all(tenantId) })
        await queryClient.removeQueries({ queryKey: supplierKeys.detail(tenantId, supplierId) })
      }
      router.push("/app/suppliers")
    },
    onError: (cause) => {
      setServerError(cause instanceof ApiError && (cause.status === 400 || cause.status === 409) ? "This supplier cannot be deleted. It may be referenced by a Purchase Order." : cause instanceof Error ? cause.message : "Unable to delete supplier")
    },
  })

  if (!canRead) return <UnavailableState title="Supplier access is restricted" description="Your current tenant session does not include the supplier.read permission." />
  if (query.isPending) return <div className="h-48 animate-pulse rounded-3xl border border-border bg-card" />
  if (query.isError) return <UnavailableState title="Unable to load supplier" description={query.error instanceof ApiError && (query.error.status === 400 || query.error.status === 404) ? "This supplier was not found in the current tenant." : "The Supplier detail API could not be reached."} />
  if (!query.data) return <UnavailableState title="Supplier not found" description="The API returned no supplier record for this tenant-scoped route." />

  const supplier = query.data
  const confirmDelete = () => {
    if (window.confirm(`Delete supplier ${supplier.name}? This cannot be undone.`)) deleteMutation.mutate()
  }

  return (
    <>
      <PageHeader eyebrow="Tenant application / master data" title={supplier.name} description="Supplier details returned by the tenant-scoped backend API." actions={<StatusBadge tone="info">Supplier</StatusBadge>} />
      {serverError ? <p role="alert" className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{serverError}</p> : null}
      {isEditing && canUpdate ? <section className="rounded-3xl border border-border bg-card p-5"><SectionHeader eyebrow="Master data action" title="Edit supplier" /><SupplierForm supplier={supplier} onSaved={() => { setIsEditing(false); query.refetch() }} /></section> : <>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Supplier ID</p><p className="mt-2 break-all font-medium">{supplier.id}</p></div>
          <div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Email</p><p className="mt-2 font-medium">{supplier.email ?? "-"}</p></div>
          <div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Phone</p><p className="mt-2 font-medium">{supplier.phone ?? "-"}</p></div>
          <div className="rounded-2xl border border-border bg-card p-5 md:col-span-2 xl:col-span-3"><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Address</p><p className="mt-2 whitespace-pre-wrap font-medium">{supplier.address ?? "-"}</p></div>
        </section>
        <section className="mt-6 rounded-3xl border border-border bg-card p-5"><SectionHeader eyebrow="Purchase Order relationship" title="Supplier integration" /><p className="text-sm leading-7 text-muted-foreground">Purchase Orders reference this supplier through supplierId. Purchase Order history, receiving totals, spend, balances, and performance are not returned by the Supplier API.</p></section>
        <div className="mt-6 flex flex-wrap gap-3">{canUpdate ? <button type="button" onClick={() => { setIsEditing(true); setServerError(null) }} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">Edit supplier</button> : null}{canDelete ? <button type="button" onClick={confirmDelete} disabled={deleteMutation.isPending} className="rounded-xl border border-destructive/30 px-4 py-2.5 text-sm font-semibold text-destructive transition hover:bg-destructive/10">{deleteMutation.isPending ? "Deleting..." : "Delete supplier"}</button> : null}</div>
      </>}
      <Link href="/app/suppliers" className="mt-6 inline-flex text-sm font-semibold text-primary hover:underline">Back to suppliers</Link>
    </>
  )
}
