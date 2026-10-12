"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { EmptyState, SectionHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { getSuppliers, deleteSupplier, supplierKeys } from "@/features/erp/suppliers/api/queries"
import { SupplierForm } from "@/features/erp/suppliers/components/supplier-form"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth.store"

export function SupplierWorkspace() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const tenantId = session?.tenantId
  const canRead = hasPermission(session, "supplier.read")
  const canCreate = hasPermission(session, "supplier.create")
  const canDelete = hasPermission(session, "supplier.delete")
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: tenantId ? supplierKeys.all(tenantId) : ["suppliers", "unauthenticated"],
    queryFn: () => getSuppliers(token as string),
    enabled: Boolean(token && tenantId && canRead),
    staleTime: 60_000,
  })

  const deleteMutation = useMutation({
    mutationFn: (supplierId: string) => {
      if (!token) throw new Error("Authentication required")
      return deleteSupplier(token, supplierId)
    },
    retry: 0,
    onSuccess: async (_, supplierId) => {
      if (tenantId) {
        await queryClient.invalidateQueries({ queryKey: supplierKeys.all(tenantId) })
        await queryClient.removeQueries({ queryKey: supplierKeys.detail(tenantId, supplierId) })
      }
      setServerError(null)
    },
    onError: (cause) => {
      if (cause instanceof ApiError && (cause.status === 400 || cause.status === 409)) {
        setServerError("This supplier could not be deleted. It may be referenced by a Purchase Order.")
        return
      }
      setServerError(cause instanceof Error ? cause.message : "Unable to delete supplier")
    },
  })

  if (!canRead) return <UnavailableState title="Supplier access is restricted" description="Your current tenant session does not include the supplier.read permission." />
  if (query.isPending) return <div className="space-y-3"><div className="h-20 animate-pulse rounded-3xl bg-muted" /><div className="h-64 animate-pulse rounded-3xl bg-muted" /></div>
  if (query.isError) return <UnavailableState title="Unable to load suppliers" description={query.error instanceof ApiError && query.error.status === 403 ? "Your session is not authorized to view suppliers." : "The Suppliers API could not be reached. No placeholder records are shown."} />

  const suppliers = query.data ?? []
  const confirmDelete = (supplierId: string, supplierName: string) => {
    if (window.confirm(`Delete supplier ${supplierName}? This cannot be undone.`)) deleteMutation.mutate(supplierId)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-sm font-semibold text-foreground">Supplier master data</p><p className="mt-1 text-sm text-muted-foreground">Tenant-scoped supplier records returned by the backend.</p></div>
        {canCreate ? <button type="button" onClick={() => { setIsCreateOpen((open) => !open); setServerError(null) }} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">{isCreateOpen ? "Close form" : "New supplier"}</button> : <StatusBadge tone="neutral">Read only</StatusBadge>}
      </div>
      {serverError ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{serverError}</p> : null}
      {isCreateOpen && canCreate ? <section className="rounded-3xl border border-border bg-card p-5"><SectionHeader eyebrow="Master data action" title="Create supplier" /><SupplierForm onSaved={(supplierId) => { setIsCreateOpen(false); router.push(`/app/suppliers/${supplierId}`) }} /></section> : null}
      {!suppliers.length ? <EmptyState title="No suppliers yet" description="This tenant has no supplier records available from the current backend contract." /> : <>
        <section className="hidden overflow-hidden rounded-3xl border border-border bg-card md:block"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-muted text-muted-foreground"><tr>{["Supplier", "Phone", "Email", "Address", "Created", "Actions"].map((heading) => <th key={heading} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em]">{heading}</th>)}</tr></thead><tbody>{suppliers.map((supplier) => <tr key={supplier.id} className="border-t border-border transition-colors hover:bg-muted/50"><td className="px-4 py-4"><Link href={`/app/suppliers/${supplier.id}`} className="font-semibold text-foreground hover:text-primary">{supplier.name}</Link><p className="mt-1 text-xs text-muted-foreground">{supplier.id}</p></td><td className="px-4 py-4 text-muted-foreground">{supplier.phone ?? "-"}</td><td className="px-4 py-4 text-muted-foreground">{supplier.email ?? "-"}</td><td className="max-w-xs truncate px-4 py-4 text-muted-foreground">{supplier.address ?? "-"}</td><td className="px-4 py-4 text-muted-foreground">{new Date(supplier.createdAt).toLocaleDateString()}</td><td className="px-4 py-4">{canDelete ? <button type="button" onClick={() => confirmDelete(supplier.id, supplier.name)} disabled={deleteMutation.isPending} className="text-xs font-semibold uppercase tracking-[0.14em] text-destructive hover:underline">Delete</button> : <span className="text-xs text-muted-foreground">-</span>}</td></tr>)}</tbody></table></div></section>
        <section className="space-y-3 md:hidden">{suppliers.map((supplier) => <div key={supplier.id} className="rounded-2xl border border-border bg-card p-4"><div className="flex items-start justify-between gap-3"><Link href={`/app/suppliers/${supplier.id}`} className="font-semibold text-foreground hover:text-primary">{supplier.name}</Link><StatusBadge tone="info">Supplier</StatusBadge></div><dl className="mt-3 space-y-1 text-sm text-muted-foreground"><div><dt className="inline font-medium text-foreground">Phone: </dt><dd className="inline">{supplier.phone ?? "-"}</dd></div><div><dt className="inline font-medium text-foreground">Email: </dt><dd className="inline">{supplier.email ?? "-"}</dd></div><div><dt className="inline font-medium text-foreground">Address: </dt><dd className="inline">{supplier.address ?? "-"}</dd></div></dl><div className="mt-4 flex items-center justify-between"><Link href={`/app/suppliers/${supplier.id}`} className="text-sm font-semibold text-primary hover:underline">View details</Link>{canDelete ? <button type="button" onClick={() => confirmDelete(supplier.id, supplier.name)} disabled={deleteMutation.isPending} className="text-xs font-semibold uppercase tracking-[0.14em] text-destructive hover:underline">Delete</button> : null}</div></div>)}</section>
      </>}
      <section className="rounded-3xl border border-border bg-card p-5"><SectionHeader eyebrow="Contract note" title="Purchase Order boundary" /><p className="text-sm text-muted-foreground">Suppliers are referenced by Purchase Orders. The current Supplier API does not return purchase-order history, spend, balances, performance metrics, or inventory data.</p></section>
    </div>
  )
}
