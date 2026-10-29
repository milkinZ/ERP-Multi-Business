"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { EmptyState, PageHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth.store"
import { getPermissions, getRole, getRolePermissions, roleKeys, updateRolePermissions } from "@/features/erp/roles/api/queries"
import { RoleForm } from "@/features/erp/roles/components/role-form"

export function RoleDetailWorkspace({ roleId }: { roleId: string }) {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isEditingPermissions, setIsEditingPermissions] = useState(false)
  const [selectedCodes, setSelectedCodes] = useState<string[] | null>(null)
  const [assignmentError, setAssignmentError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const tenantId = session?.tenantId
  const canRead = hasPermission(session, "rbac.role.read")
  const canUpdate = hasPermission(session, "rbac.role.update")

  const roleQuery = useQuery({ queryKey: tenantId ? roleKeys.detail(tenantId, roleId) : ["roles", "unauthenticated", roleId], queryFn: () => getRole(token as string, roleId), enabled: Boolean(token && tenantId && canRead && roleId), staleTime: 60_000 })
  const permissionQuery = useQuery({ queryKey: tenantId ? roleKeys.permissions(tenantId) : ["permissions", "unauthenticated"], queryFn: () => getPermissions(token as string), enabled: Boolean(token && tenantId && canRead), staleTime: 300_000 })
  const assignedQuery = useQuery({ queryKey: tenantId ? roleKeys.rolePermissions(tenantId, roleId) : ["role-permissions", "unauthenticated", roleId], queryFn: () => getRolePermissions(token as string, roleId), enabled: Boolean(token && tenantId && canRead && roleId), staleTime: 60_000 })

  const assignmentMutation = useMutation({
    mutationFn: () => updateRolePermissions(token as string, roleId, selectedCodes ?? assignedCodes),
    retry: 0,
    onSuccess: async () => { if (tenantId) await Promise.all([queryClient.invalidateQueries({ queryKey: roleKeys.rolePermissions(tenantId, roleId) }), queryClient.invalidateQueries({ queryKey: roleKeys.detail(tenantId, roleId) })]); setAssignmentError(null); setIsEditingPermissions(false) },
    onError: (cause) => setAssignmentError(cause instanceof Error ? cause.message : "Unable to update role permissions"),
  })

  if (!canRead) return <UnavailableState title="Role access is restricted" description="Your current tenant session does not include rbac.role.read." />
  if (roleQuery.isPending || assignedQuery.isPending || permissionQuery.isPending) return <div className="h-72 animate-pulse rounded-3xl bg-muted" />
  if (roleQuery.isError) return <UnavailableState title="Unable to load role" description={roleQuery.error instanceof ApiError && roleQuery.error.status === 404 ? "Role not found in the authenticated tenant scope." : "The Roles API could not be reached."} />
  if (assignedQuery.isError || permissionQuery.isError) return <UnavailableState title="Unable to load permissions" description="The permission catalog or role assignment could not be loaded. No permission changes are shown." />

  const role = roleQuery.data
  const permissions = permissionQuery.data ?? []
  const assignedCodes = assignedQuery.data?.permissionCodes ?? []
  const displayedCodes = selectedCodes ?? assignedCodes
  const togglePermission = (code: string) => setSelectedCodes((current) => {
    const next = current ?? assignedCodes
    return next.includes(code) ? next.filter((value) => value !== code) : [...next, code]
  })
  const beginEditingPermissions = () => { setSelectedCodes(assignedCodes); setIsEditingPermissions(true) }

  return (
    <>
      <PageHeader eyebrow="Tenant application / roles" title={role.name} description="Tenant-owned role and global permission assignments returned by the backend." actions={<StatusBadge tone="info">Tenant role</StatusBadge>} />
      <div className="space-y-6">
        {isEditOpen && canUpdate && !role.isSystem ? <section className="rounded-3xl border border-border bg-card p-5"><RoleForm role={role} onSaved={() => setIsEditOpen(false)} /></section> : null}
        <section className="rounded-3xl border border-border bg-card p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-semibold text-foreground">Role details</h2><p className="mt-1 break-all text-xs text-muted-foreground">{role.id}</p></div>{canUpdate && !role.isSystem ? <button type="button" onClick={() => setIsEditOpen((value) => !value)} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground">{isEditOpen ? "Close" : "Edit role"}</button> : <StatusBadge tone={role.isSystem ? "info" : "neutral"}>{role.isSystem ? "Protected system role" : "Read only"}</StatusBadge>}</div><dl className="mt-6 grid gap-5 sm:grid-cols-2"><div><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Name</dt><dd className="mt-2 text-sm text-foreground">{role.name}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Description</dt><dd className="mt-2 text-sm text-foreground">{role.description || "-"}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Assigned users</dt><dd className="mt-2 text-sm text-foreground">{role.assignedUserCount}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Permissions</dt><dd className="mt-2 text-sm text-foreground">{role.permissionCount}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Tenant ID</dt><dd className="mt-2 break-all text-sm text-foreground">{role.tenantId}</dd></div></dl></section>
        <section className="rounded-3xl border border-border bg-card p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-semibold text-foreground">Permissions</h2><p className="mt-1 text-sm text-muted-foreground">Global permission catalog with tenant role assignment state.</p></div>{canUpdate && !role.isSystem ? <button type="button" onClick={beginEditingPermissions} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white">{isEditingPermissions ? "Editing permissions" : "Edit permissions"}</button> : null}</div>{assignmentError ? <p role="alert" className="mt-4 text-sm text-destructive">{assignmentError}</p> : null}{!permissions.length ? <EmptyState title="No permissions" description="The backend returned an empty permission catalog." /> : <div className="mt-5 grid gap-3 sm:grid-cols-2">{permissions.map((permission) => { const checked = displayedCodes.includes(permission.code); return <label key={permission.id} className={`flex items-start gap-3 rounded-xl border p-3 ${checked ? "border-primary bg-primary/5" : "border-border"}`}><input type="checkbox" checked={checked} disabled={!canUpdate || role.isSystem || !isEditingPermissions} onChange={() => togglePermission(permission.code)} className="mt-1" /><span><span className="block text-sm font-semibold text-foreground">{permission.name}</span><span className="mt-1 block text-xs text-muted-foreground">{permission.code}</span></span></label> })}</div>}{canUpdate && !role.isSystem && isEditingPermissions ? <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" disabled={assignmentMutation.isPending} onClick={() => assignmentMutation.mutate()} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{assignmentMutation.isPending ? "Saving permissions..." : "Save permissions"}</button><span className="text-xs text-muted-foreground">Saving replaces the role&apos;s current permission assignment.</span></div> : null}</section>
        <Link href="/app/roles" className="inline-flex rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground">Back to roles</Link>
      </div>
    </>
  )
}
