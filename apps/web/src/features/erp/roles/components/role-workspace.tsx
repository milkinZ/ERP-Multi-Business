"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { EmptyState, SectionHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth.store"
import { deleteRole, getRoles, roleKeys } from "@/features/erp/roles/api/queries"
import { RoleForm } from "@/features/erp/roles/components/role-form"

export function RoleWorkspace() {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const tenantId = session?.tenantId
  const canRead = hasPermission(session, "rbac.role.read")
  const canCreate = hasPermission(session, "rbac.role.create")
  const canDelete = hasPermission(session, "rbac.role.delete")

  const listQuery = { page, limit: 20, search: search.trim() || undefined, sortBy: "name" as const, sortOrder: "asc" as const }
  const query = useQuery({
    queryKey: tenantId ? roleKeys.list(tenantId, listQuery) : ["roles", "unauthenticated"],
    queryFn: () => getRoles(token as string, listQuery),
    enabled: Boolean(token && tenantId && canRead),
    staleTime: 60_000,
  })

  const removeMutation = useMutation({
    mutationFn: (roleId: string) => deleteRole(token as string, roleId),
    retry: 0,
    onSuccess: async (_, roleId) => {
      if (tenantId) {
        await queryClient.invalidateQueries({ queryKey: roleKeys.all(tenantId) })
        await queryClient.removeQueries({ queryKey: roleKeys.detail(tenantId, roleId) })
      }
      setError(null)
    },
    onError: (cause) => setError(cause instanceof ApiError && cause.status === 409 ? "This role cannot be deleted because it is still referenced." : cause instanceof Error ? cause.message : "Unable to delete role"),
  })

  if (!canRead) return <UnavailableState title="Role access is restricted" description="Your current tenant session does not include rbac.role.read." />
  if (!token || !tenantId) return <UnavailableState title="Roles are unavailable" description="Sign in to load tenant-scoped roles." />
  if (query.isPending) return <div className="space-y-3"><div className="h-20 animate-pulse rounded-3xl bg-muted" /><div className="h-64 animate-pulse rounded-3xl bg-muted" /></div>
  if (query.isError) return <UnavailableState title="Unable to load roles" description={query.error instanceof ApiError && query.error.status === 403 ? "Your session is not authorized to view roles." : "The Roles API could not be reached. No placeholder roles are shown."} />

  const roles = query.data?.data ?? []
  const pagination = query.data?.pagination
  const confirmDelete = (role: { id: string; name: string }) => { if (window.confirm(`Delete role ${role.name}? This cannot be undone.`)) removeMutation.mutate(role.id) }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-foreground">Tenant role catalog</p><p className="mt-1 text-sm text-muted-foreground">Protected system roles and tenant-customized roles. Permission assignment is managed from each role detail.</p></div>{canCreate ? <button type="button" onClick={() => { setIsCreateOpen((value) => !value); setError(null) }} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">{isCreateOpen ? "Close form" : "New role"}</button> : <StatusBadge tone="neutral">Read only</StatusBadge>}</section>
      {error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}
      {isCreateOpen && canCreate ? <section className="rounded-3xl border border-border bg-card p-5"><SectionHeader eyebrow="Role action" title="Create role" /><RoleForm onSaved={() => setIsCreateOpen(false)} /></section> : null}
      <label className="block max-w-sm text-sm font-medium text-foreground">Search roles<input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3" /></label>
      {!roles.length ? <EmptyState title="No roles" description={search ? "No roles match this search." : "The backend returned no tenant roles."} /> : <section className="overflow-hidden rounded-3xl border border-border bg-card"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-muted text-muted-foreground"><tr>{["Role", "Users", "Permissions", "Type", "Actions"].map((heading) => <th key={heading} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em]">{heading}</th>)}</tr></thead><tbody>{roles.map((role) => <tr key={role.id} className="border-t border-border hover:bg-muted/50"><td className="px-4 py-4"><Link href={`/app/roles/${role.id}`} className="font-semibold text-foreground hover:text-primary">{role.name}</Link><p className="mt-1 text-xs text-muted-foreground">{role.description || role.id}</p></td><td className="px-4 py-4 text-muted-foreground">{role.assignedUserCount}</td><td className="px-4 py-4 text-muted-foreground">{role.permissionCount}</td><td className="px-4 py-4"><StatusBadge tone={role.isSystem ? "info" : "neutral"}>{role.isSystem ? "System" : "Custom"}</StatusBadge></td><td className="px-4 py-4"><div className="flex gap-3"><Link href={`/app/roles/${role.id}`} className="text-xs font-semibold uppercase tracking-[0.14em] text-primary hover:underline">View</Link>{canDelete && !role.isSystem ? <button type="button" disabled={removeMutation.isPending} onClick={() => confirmDelete(role)} className="text-xs font-semibold uppercase tracking-[0.14em] text-destructive hover:underline">Delete</button> : null}</div></td></tr>)}</tbody></table></div><div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground"><span>{pagination?.total ?? 0} roles</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-border px-3 py-1 disabled:opacity-40">Previous</button><span className="px-2 py-1">{page} / {Math.max(1, pagination?.totalPages ?? 1)}</span><button type="button" disabled={page >= (pagination?.totalPages ?? 1)} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-border px-3 py-1 disabled:opacity-40">Next</button></div></div></section>}
    </div>
  )
}
