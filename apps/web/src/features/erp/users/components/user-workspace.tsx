"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  EmptyState,
  StatusBadge,
  UnavailableState,
} from "@/components/data-display/states";
import { ApiError } from "@/lib/api/client";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";
import { getOutlets, outletKeys } from "@/features/erp/outlets/api/queries";
import { getRoles, roleKeys } from "@/features/erp/roles/api/queries";
import {
  createInvitation,
  getPendingInvitations,
  getUsers,
  revokeInvitation,
  setUserStatus,
  userKeys,
  type UserListQuery,
} from "@/features/erp/users/api/queries";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

export function UserWorkspace() {
  const [email, setEmail] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE" | undefined>();
  const [page, setPage] = useState(1);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [outletIds, setOutletIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const tenantId = session?.tenantId;
  const canRead = hasPermission(session, "user.read");
  const canManage = hasPermission(session, "rbac.user.role.manage");
  const canManageOutlets = hasPermission(session, "rbac.user.outlet.manage");
  const canReadRoles = hasPermission(session, "rbac.role.read");
  const canReadOutlets = hasPermission(session, "outlet.read");

  const listQuery: UserListQuery = {
    page,
    limit: 20,
    search: search.trim() || undefined,
    status,
    sortBy: "createdAt",
    sortOrder: "desc",
  };
  const query = useQuery({
    queryKey: tenantId
      ? userKeys.list(tenantId, listQuery)
      : ["users", "unauthenticated"],
    queryFn: () => getUsers(token as string, listQuery),
    enabled: Boolean(token && tenantId && canRead),
    staleTime: 60_000,
  });
  const invitationsQuery = useQuery({
    queryKey: tenantId
      ? userKeys.invitations(tenantId)
      : ["users", "invitations", "unauthenticated"],
    queryFn: () => getPendingInvitations(token as string),
    enabled: Boolean(token && tenantId && canManage && canRead),
    staleTime: 30_000,
  });
  const rolesQuery = useQuery({
    queryKey: tenantId
      ? roleKeys.list(tenantId, { page: 1, limit: 100 })
      : ["roles", "unauthenticated"],
    queryFn: () => getRoles(token as string, { page: 1, limit: 100 }),
    enabled: Boolean(token && tenantId && canManage && canReadRoles),
    staleTime: 60_000,
  });
  const outletsQuery = useQuery({
    queryKey: tenantId
      ? outletKeys.list(tenantId, { page: 1, limit: 100, status: "ACTIVE" })
      : ["outlets", "unauthenticated"],
    queryFn: () =>
      getOutlets(token as string, { page: 1, limit: 100, status: "ACTIVE" }),
    enabled: Boolean(
      token && tenantId && canManage && canManageOutlets && canReadOutlets,
    ),
    staleTime: 60_000,
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      createInvitation(token as string, { email, roleIds, outletIds }),
    retry: 0,
    onSuccess: async () => {
      if (tenantId) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: userKeys.invitations(tenantId),
          }),
          queryClient.invalidateQueries({ queryKey: userKeys.all(tenantId) }),
        ]);
      }
      setEmail("");
      setRoleIds([]);
      setOutletIds([]);
      setError(null);
    },
    onError: (cause) =>
      setError(
        cause instanceof Error ? cause.message : "Unable to send invitation",
      ),
  });
  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeInvitation(token as string, id),
    retry: 0,
    onSuccess: async () => {
      if (tenantId)
        await queryClient.invalidateQueries({
          queryKey: userKeys.invitations(tenantId),
        });
      setError(null);
    },
    onError: (cause) =>
      setError(
        cause instanceof Error ? cause.message : "Unable to revoke invitation",
      ),
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setUserStatus(token as string, id, isActive),
    retry: 0,
    onSuccess: async () => {
      if (tenantId)
        await queryClient.invalidateQueries({
          queryKey: userKeys.all(tenantId),
        });
      setError(null);
    },
    onError: (cause) =>
      setError(
        cause instanceof Error ? cause.message : "Unable to update user status",
      ),
  });

  if (!canRead) {
    return (
      <UnavailableState
        title="User access is restricted"
        description="Your current tenant session does not include the user.read permission."
      />
    );
  }
  if (!token || !tenantId) {
    return (
      <UnavailableState
        title="Users are unavailable"
        description="Sign in to load users for the authenticated tenant."
      />
    );
  }
  if (query.isPending) {
    return (
      <div className="space-y-3">
        <div className="h-20 animate-pulse rounded-3xl bg-muted" />
        <div className="h-64 animate-pulse rounded-3xl bg-muted" />
      </div>
    );
  }
  if (query.isError) {
    const description =
      query.error instanceof ApiError && query.error.status === 403
        ? "Your session is not authorized to view tenant users."
        : "The Users API could not be reached. No user records are shown.";
    return (
      <UnavailableState
        title="Unable to load users"
        description={description}
      />
    );
  }

  const users = query.data?.data ?? [];
  const pagination = query.data?.pagination;
  const roles = rolesQuery.data?.data ?? [];
  const outlets = outletsQuery.data?.data ?? [];
  const canInvite =
    canManage &&
    canReadRoles &&
    !rolesQuery.isError &&
    (!canManageOutlets || (canReadOutlets && !outletsQuery.isError));

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-card p-5">
        <p className="text-sm font-semibold text-foreground">Tenant users</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Invite users by email, assign tenant roles and outlets, and suspend
          accounts. Passwords and invitation tokens are never returned by the
          API.
        </p>
      </section>

      {canManage ? (
        <section className="space-y-4 rounded-3xl border border-border bg-card p-5">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Invite a user
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The recipient gets a single-use setup link that expires after
              seven days.
            </p>
          </div>
          {!canReadRoles ? (
            <UnavailableState
              title="Assignment options are restricted"
              description="Role read permission is required to prepare an invitation."
            />
          ) : null}
          {canManageOutlets && !canReadOutlets ? (
            <p className="text-sm text-muted-foreground">
              Outlet assignment is unavailable because outlet.read is not
              granted. You can still invite the user without outlet access.
            </p>
          ) : null}
          {canInvite ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setError(null);
                inviteMutation.mutate();
              }}
              className="space-y-4"
            >
              <label className="block text-sm font-medium text-foreground">
                Email
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3"
                />
              </label>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-foreground">
                  Roles (choose at least one)
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {roles.map((role) => (
                    <label
                      key={role.id}
                      className="flex items-start gap-2 rounded-xl border border-border p-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={roleIds.includes(role.id)}
                        onChange={(event) =>
                          setRoleIds((current) =>
                            event.target.checked
                              ? [...current, role.id]
                              : current.filter((id) => id !== role.id),
                          )
                        }
                      />
                      <span>
                        {role.name}
                        {role.isSystem ? " (system)" : ""}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {canManageOutlets && canReadOutlets ? (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-foreground">
                    Outlet access (optional)
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {outlets.map((outlet) => (
                      <label
                        key={outlet.id}
                        className="flex items-start gap-2 rounded-xl border border-border p-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={outletIds.includes(outlet.id)}
                          onChange={(event) =>
                            setOutletIds((current) =>
                              event.target.checked
                                ? [...current, outlet.id]
                                : current.filter((id) => id !== outlet.id),
                            )
                          }
                        />
                        <span>{outlet.name}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              <button
                type="submit"
                disabled={
                  inviteMutation.isPending || !email || roleIds.length === 0
                }
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {inviteMutation.isPending
                  ? "Sending invitation..."
                  : "Send invitation"}
              </button>
            </form>
          ) : null}
          {invitationsQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Pending invitations could not be loaded.
            </p>
          ) : null}
          {invitationsQuery.data?.data.length ? (
            <div className="space-y-2 border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-foreground">
                Pending invitations
              </h3>
              {invitationsQuery.data.data.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {invitation.email}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Expires {formatDate(invitation.expiresAt)} · Roles:{" "}
                      {invitation.roles.map((role) => role.name).join(", ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={revokeMutation.isPending}
                    onClick={() => revokeMutation.mutate(invitation.id)}
                    className="text-xs font-semibold text-destructive hover:underline"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="block flex-1 text-sm font-medium text-foreground">
          Search users
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3"
          />
        </label>
        <label className="block text-sm font-medium text-foreground">
          Status
          <select
            value={status ?? "ALL"}
            onChange={(event) => {
              setStatus(
                event.target.value === "ALL"
                  ? undefined
                  : (event.target.value as "ACTIVE" | "INACTIVE"),
              );
              setPage(1);
            }}
            className="mt-2 h-11 rounded-xl border border-border bg-card px-3"
          >
            <option value="ALL">All</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
      </div>

      {!users.length ? (
        <EmptyState
          title="No tenant users"
          description="No users match the current search and status filters."
        />
      ) : (
        <section className="overflow-hidden rounded-3xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  {[
                    "User",
                    "Status",
                    "Roles",
                    "Outlets",
                    "Created",
                    "Actions",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em]"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-t border-border transition-colors hover:bg-muted/50"
                  >
                    <td className="px-4 py-4">
                      <Link
                        href={`/app/users/${user.id}`}
                        className="font-semibold text-foreground hover:text-primary"
                      >
                        {user.email}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {user.id}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge tone={user.isActive ? "success" : "neutral"}>
                        {user.isActive ? "Active" : "Inactive"}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {user.roles.length ? (
                          user.roles.map((role) => (
                            <StatusBadge key={role.id} tone="info">
                              {role.name}
                            </StatusBadge>
                          ))
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">
                      {user.outlets.length
                        ? user.outlets.map((outlet) => outlet.name).join(", ")
                        : "-"}
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-3">
                        <Link
                          href={`/app/users/${user.id}`}
                          className="text-xs font-semibold uppercase tracking-[0.14em] text-primary hover:underline"
                        >
                          Manage
                        </Link>
                        {canManage && user.id !== session?.userId ? (
                          <button
                            type="button"
                            disabled={statusMutation.isPending}
                            onClick={() =>
                              statusMutation.mutate({
                                id: user.id,
                                isActive: !user.isActive,
                              })
                            }
                            className="text-xs font-semibold text-destructive hover:underline"
                          >
                            {user.isActive ? "Deactivate" : "Activate"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
            <span>{pagination?.total ?? 0} users</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
                className="rounded-lg border border-border px-3 py-1 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="px-2 py-1">
                {page} / {Math.max(1, pagination?.totalPages ?? 1)}
              </span>
              <button
                type="button"
                disabled={page >= (pagination?.totalPages ?? 1)}
                onClick={() => setPage((value) => value + 1)}
                className="rounded-lg border border-border px-3 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
