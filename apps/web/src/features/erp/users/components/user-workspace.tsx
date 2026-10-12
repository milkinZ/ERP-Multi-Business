"use client"

import React from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"

import { EmptyState, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth.store"
import { getUsers, userKeys } from "@/features/erp/users/api/queries"

function formatDate(value: string) {
  return new Date(value).toLocaleDateString()
}

export function UserWorkspace() {
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const tenantId = session?.tenantId
  const canRead = hasPermission(session, "user.read")

  const query = useQuery({
    queryKey: tenantId ? userKeys.all(tenantId) : ["users", "unauthenticated"],
    queryFn: () => getUsers(token as string),
    enabled: Boolean(token && tenantId && canRead),
    staleTime: 60_000,
  })

  if (!canRead) {
    return <UnavailableState title="User access is restricted" description="Your current tenant session does not include the user.read permission." />
  }

  if (!token || !tenantId) {
    return <UnavailableState title="Users are unavailable" description="Sign in to load users for the authenticated tenant." />
  }

  if (query.isPending) {
    return <div className="space-y-3"><div className="h-20 animate-pulse rounded-3xl bg-muted" /><div className="h-64 animate-pulse rounded-3xl bg-muted" /></div>
  }

  if (query.isError) {
    const description = query.error instanceof ApiError && query.error.status === 403
      ? "Your session is not authorized to view tenant users."
      : "The Users API could not be reached. No user records are shown."
    return <UnavailableState title="Unable to load users" description={description} />
  }

  const users = query.data ?? []

  if (!users.length) {
    return <EmptyState title="No tenant users" description="The backend returned no active users for this tenant." />
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-card p-5">
        <p className="text-sm font-semibold text-foreground">Tenant users</p>
        <p className="mt-1 text-sm text-muted-foreground">Safe identity fields and current role/outlet assignments returned by the backend. Credentials are never exposed.</p>
      </section>

      <section className="hidden overflow-hidden rounded-3xl border border-border bg-card md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-muted text-muted-foreground"><tr>{["User", "Roles", "Outlets", "Created", "Actions"].map((heading) => <th key={heading} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em]">{heading}</th>)}</tr></thead>
            <tbody>{users.map((user) => <tr key={user.id} className="border-t border-border transition-colors hover:bg-muted/50">
              <td className="px-4 py-4"><Link href={`/app/users/${user.id}`} className="font-semibold text-foreground hover:text-primary">{user.email}</Link><p className="mt-1 text-xs text-muted-foreground">{user.id}</p></td>
              <td className="px-4 py-4"><div className="flex flex-wrap gap-1.5">{user.roles.length ? user.roles.map((role) => <StatusBadge key={role.id} tone="info">{role.name}</StatusBadge>) : <span className="text-muted-foreground">-</span>}</div></td>
              <td className="px-4 py-4 text-muted-foreground">{user.outlets.length ? user.outlets.map((outlet) => outlet.name).join(", ") : "-"}</td>
              <td className="px-4 py-4 text-muted-foreground">{formatDate(user.createdAt)}</td>
              <td className="px-4 py-4"><Link href={`/app/users/${user.id}`} className="text-xs font-semibold uppercase tracking-[0.14em] text-primary hover:underline">View</Link></td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3 md:hidden">{users.map((user) => <article key={user.id} className="rounded-2xl border border-border bg-card p-4"><div className="flex items-start justify-between gap-3"><div><Link href={`/app/users/${user.id}`} className="font-semibold text-foreground hover:text-primary">{user.email}</Link><p className="mt-1 text-xs text-muted-foreground">{user.id}</p></div><StatusBadge tone="info">Tenant user</StatusBadge></div><dl className="mt-4 space-y-2 text-sm"><div><dt className="inline font-medium text-foreground">Roles: </dt><dd className="inline text-muted-foreground">{user.roles.map((role) => role.name).join(", ") || "-"}</dd></div><div><dt className="inline font-medium text-foreground">Outlets: </dt><dd className="inline text-muted-foreground">{user.outlets.map((outlet) => outlet.name).join(", ") || "-"}</dd></div><div><dt className="inline font-medium text-foreground">Created: </dt><dd className="inline text-muted-foreground">{formatDate(user.createdAt)}</dd></div></dl><Link href={`/app/users/${user.id}`} className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline">View details</Link></article>)}</section>
    </div>
  )
}
