"use client"

import React from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"

import { ApiError } from "@/lib/api/client"
import { EmptyState, PageHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth.store"
import { getUser, userKeys } from "@/features/erp/users/api/queries"

export function UserDetailWorkspace({ userId }: { userId: string }) {
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const tenantId = session?.tenantId
  const canRead = hasPermission(session, "user.read")
  const query = useQuery({
    queryKey: tenantId ? userKeys.detail(tenantId, userId) : ["users", "unauthenticated", userId],
    queryFn: () => getUser(token as string, userId),
    enabled: Boolean(token && tenantId && canRead && userId),
    staleTime: 60_000,
  })

  if (!canRead) return <UnavailableState title="User access is restricted" description="Your current tenant session does not include the user.read permission." />
  if (query.isPending) return <div className="h-72 animate-pulse rounded-3xl bg-muted" />
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) return <EmptyState title="User not found" description="This user is not available in the authenticated tenant scope." />
    return <UnavailableState title="Unable to load user" description={query.error instanceof ApiError && query.error.status === 403 ? "Your session is not authorized to view tenant users." : "The Users API could not be reached. No user details are shown."} />
  }

  const user = query.data
  return (
    <>
      <PageHeader eyebrow="Tenant application / users" title={user.email} description="Safe user details returned by the tenant-scoped Users API." actions={<StatusBadge tone="info">Read only</StatusBadge>} />
      <section className="rounded-3xl border border-border bg-card p-6">
        <dl className="grid gap-5 sm:grid-cols-2">
          <div><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">User ID</dt><dd className="mt-2 break-all text-sm text-foreground">{user.id}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Email</dt><dd className="mt-2 break-all text-sm text-foreground">{user.email}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Created</dt><dd className="mt-2 text-sm text-foreground">{new Date(user.createdAt).toLocaleString()}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Updated</dt><dd className="mt-2 text-sm text-foreground">{new Date(user.updatedAt).toLocaleString()}</dd></div>
        </dl>
        <div className="mt-8 grid gap-6 border-t border-border pt-6 sm:grid-cols-2">
          <div><h2 className="text-sm font-semibold text-foreground">Roles</h2><div className="mt-3 flex flex-wrap gap-2">{user.roles.length ? user.roles.map((role) => <StatusBadge key={role.id} tone="info">{role.name}</StatusBadge>) : <span className="text-sm text-muted-foreground">No active roles returned.</span>}</div></div>
          <div><h2 className="text-sm font-semibold text-foreground">Outlets</h2><div className="mt-3 space-y-2">{user.outlets.length ? user.outlets.map((outlet) => <p key={outlet.id} className="text-sm text-muted-foreground">{outlet.name}</p>) : <span className="text-sm text-muted-foreground">No active outlets returned.</span>}</div></div>
        </div>
        <p className="mt-8 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">This view is read-only. The current backend does not expose tenant user create, update, deactivate, or delete operations.</p>
        <Link href="/app/users" className="mt-6 inline-flex rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground">Back to users</Link>
      </section>
    </>
  )
}
