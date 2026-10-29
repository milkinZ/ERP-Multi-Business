"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  StatusBadge,
  UnavailableState,
} from "@/components/data-display/states";
import { ApiError } from "@/lib/api/client";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";
import { getOutlets, outletKeys } from "@/features/erp/outlets/api/queries";
import { getRoles, roleKeys } from "@/features/erp/roles/api/queries";
import {
  getUser,
  getUserOutlets,
  getUserRoles,
  setUserOutlets,
  setUserRoles,
  setUserStatus,
  userKeys,
} from "@/features/erp/users/api/queries";

type UserDetailWorkspaceProps = { userId: string };

export function UserDetailWorkspace({ userId }: UserDetailWorkspaceProps) {
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[] | null>(null);
  const [selectedOutletIds, setSelectedOutletIds] = useState<string[] | null>(
    null,
  );
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

  const userQuery = useQuery({
    queryKey: tenantId
      ? userKeys.detail(tenantId, userId)
      : ["users", "detail", "unauthenticated", userId],
    queryFn: () => getUser(token as string, userId),
    enabled: Boolean(token && tenantId && canRead),
    staleTime: 60_000,
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
    enabled: Boolean(token && tenantId && canManageOutlets && canReadOutlets),
    staleTime: 60_000,
  });
  const userRolesQuery = useQuery({
    queryKey: tenantId
      ? userKeys.roles(tenantId, userId)
      : ["users", "roles", "unauthenticated", userId],
    queryFn: () => getUserRoles(token as string, userId),
    enabled: Boolean(token && tenantId && canManage && canReadRoles),
  });
  const userOutletsQuery = useQuery({
    queryKey: tenantId
      ? userKeys.outlets(tenantId, userId)
      : ["users", "outlets", "unauthenticated", userId],
    queryFn: () => getUserOutlets(token as string, userId),
    enabled: Boolean(token && tenantId && canManageOutlets && canReadOutlets),
  });

  const invalidateUser = async () => {
    if (!tenantId) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: userKeys.all(tenantId) }),
      queryClient.invalidateQueries({
        queryKey: userKeys.roles(tenantId, userId),
      }),
      queryClient.invalidateQueries({
        queryKey: userKeys.outlets(tenantId, userId),
      }),
    ]);
  };
  const rolesMutation = useMutation({
    mutationFn: (roleIds: string[]) =>
      setUserRoles(token as string, userId, roleIds),
    retry: 0,
    onSuccess: async () => {
      setSelectedRoleIds(null);
      setError(null);
      await invalidateUser();
    },
    onError: (cause) =>
      setError(
        cause instanceof Error ? cause.message : "Unable to update roles",
      ),
  });
  const outletsMutation = useMutation({
    mutationFn: (outletIds: string[]) =>
      setUserOutlets(token as string, userId, outletIds),
    retry: 0,
    onSuccess: async () => {
      setSelectedOutletIds(null);
      setError(null);
      await invalidateUser();
    },
    onError: (cause) =>
      setError(
        cause instanceof Error ? cause.message : "Unable to update outlets",
      ),
  });
  const statusMutation = useMutation({
    mutationFn: (isActive: boolean) =>
      setUserStatus(token as string, userId, isActive),
    retry: 0,
    onSuccess: async () => {
      setError(null);
      await invalidateUser();
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
        title="User details are unavailable"
        description="Sign in to load this tenant user."
      />
    );
  }
  if (userQuery.isPending) {
    return <div className="h-72 animate-pulse rounded-3xl bg-muted" />;
  }
  if (userQuery.isError || !userQuery.data) {
    const description =
      userQuery.error instanceof ApiError && userQuery.error.status === 404
        ? "This user does not exist in the current tenant."
        : "The user record could not be loaded.";
    return (
      <UnavailableState title="Unable to load user" description={description} />
    );
  }

  const user = userQuery.data;
  const roles = rolesQuery.data?.data ?? [];
  const outlets = outletsQuery.data?.data ?? [];
  const currentRoleIds = selectedRoleIds ?? userRolesQuery.data?.roleIds ?? [];
  const currentOutletIds =
    selectedOutletIds ?? userOutletsQuery.data?.outletIds ?? [];
  const roleOptionsReady =
    canManage && canReadRoles && !rolesQuery.isError && !userRolesQuery.isError;
  const outletOptionsReady =
    canManageOutlets &&
    canReadOutlets &&
    !outletsQuery.isError &&
    !userOutletsQuery.isError;

  return (
    <div className="space-y-6">
      <Link
        href="/app/users"
        className="inline-flex text-sm font-semibold text-primary hover:underline"
      >
        Back to users
      </Link>
      <section className="flex flex-col justify-between gap-4 rounded-3xl border border-border bg-card p-6 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Tenant user
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">
            {user.email}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            User ID: {user.id}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge tone={user.isActive ? "success" : "neutral"}>
            {user.isActive ? "Active" : "Inactive"}
          </StatusBadge>
          {canManage && user.id !== session?.userId ? (
            <button
              type="button"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate(!user.isActive)}
              className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground disabled:opacity-50"
            >
              {user.isActive ? "Deactivate account" : "Reactivate account"}
            </button>
          ) : null}
        </div>
      </section>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      {!canManage && !canManageOutlets ? (
        <UnavailableState
          title="Assignment management is restricted"
          description="Your current role does not include permission to manage user roles and outlets."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {canManage ? (
            <section className="space-y-4 rounded-3xl border border-border bg-card p-5">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Tenant roles
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  The user must retain at least one role. System role
                  permissions are managed by the platform.
                </p>
              </div>
              {!canReadRoles ? (
                <UnavailableState
                  title="Role options are restricted"
                  description="The rbac.role.read permission is required."
                />
              ) : rolesQuery.isError || userRolesQuery.isError ? (
                <UnavailableState
                  title="Unable to load role assignments"
                  description="Check role read permissions and retry."
                />
              ) : userRolesQuery.isPending || rolesQuery.isPending ? (
                <div className="h-24 animate-pulse rounded-xl bg-muted" />
              ) : (
                <>
                  <div className="space-y-2">
                    {roles.map((role) => (
                      <label
                        key={role.id}
                        className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={currentRoleIds.includes(role.id)}
                          onChange={(event) =>
                            setSelectedRoleIds(
                              event.target.checked
                                ? [...currentRoleIds, role.id]
                                : currentRoleIds.filter((id) => id !== role.id),
                            )
                          }
                        />
                        <span>
                          <span className="font-medium text-foreground">
                            {role.name}
                          </span>
                          {role.isSystem ? (
                            <span className="ml-2 text-xs text-muted-foreground">
                              System role
                            </span>
                          ) : null}
                          {role.description ? (
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {role.description}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={
                      !roleOptionsReady ||
                      rolesMutation.isPending ||
                      !currentRoleIds.length ||
                      selectedRoleIds === null
                    }
                    onClick={() => rolesMutation.mutate(currentRoleIds)}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {rolesMutation.isPending ? "Saving..." : "Save roles"}
                  </button>
                </>
              )}
            </section>
          ) : null}

          {canManageOutlets ? (
            <section className="space-y-4 rounded-3xl border border-border bg-card p-5">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Outlet access
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Select the outlets this user can access. An empty selection
                  removes outlet assignments.
                </p>
              </div>
              {!canReadOutlets ? (
                <UnavailableState
                  title="Outlet options are restricted"
                  description="The outlet.read permission is required."
                />
              ) : outletsQuery.isError || userOutletsQuery.isError ? (
                <UnavailableState
                  title="Unable to load outlet assignments"
                  description="Check outlet read permissions and retry."
                />
              ) : userOutletsQuery.isPending || outletsQuery.isPending ? (
                <div className="h-24 animate-pulse rounded-xl bg-muted" />
              ) : (
                <>
                  <div className="space-y-2">
                    {outlets.map((outlet) => (
                      <label
                        key={outlet.id}
                        className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={currentOutletIds.includes(outlet.id)}
                          onChange={(event) =>
                            setSelectedOutletIds(
                              event.target.checked
                                ? [...currentOutletIds, outlet.id]
                                : currentOutletIds.filter(
                                    (id) => id !== outlet.id,
                                  ),
                            )
                          }
                        />
                        <span className="font-medium text-foreground">
                          {outlet.name}
                        </span>
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={
                      !outletOptionsReady ||
                      outletsMutation.isPending ||
                      selectedOutletIds === null
                    }
                    onClick={() => outletsMutation.mutate(currentOutletIds)}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {outletsMutation.isPending
                      ? "Saving..."
                      : "Save outlet access"}
                  </button>
                </>
              )}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
