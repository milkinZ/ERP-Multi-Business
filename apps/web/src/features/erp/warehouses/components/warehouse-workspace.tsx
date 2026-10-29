"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  EmptyState,
  SectionHeader,
  StatusBadge,
  UnavailableState,
} from "@/components/data-display/states";
import { ApiError } from "@/lib/api/client";
import { hasPermission } from "@/lib/permissions";
import { WarehouseForm } from "@/features/erp/warehouses/components/warehouse-form";
import {
  getWarehouses,
  removeWarehouse,
  updateWarehouse,
  warehouseKeys,
  type Warehouse,
} from "@/features/erp/warehouses/api/queries";
import { useAuthStore } from "@/stores/auth.store";

export function WarehouseWorkspace() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const tenantId = session?.tenantId;
  const canRead = hasPermission(session, "warehouse.read");
  const canCreate = hasPermission(session, "warehouse.create");
  const canUpdate = hasPermission(session, "warehouse.update");
  const canDelete = hasPermission(session, "warehouse.delete");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [lifecycleMessage, setLifecycleMessage] = useState<string | null>(null);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(
    null,
  );

  const query = useQuery({
    queryKey: tenantId
      ? warehouseKeys.all(tenantId)
      : ["warehouses", "unauthenticated"],
    queryFn: () => getWarehouses(token as string),
    enabled: Boolean(token && tenantId && canRead),
    staleTime: 60_000,
  });
  const removeMutation = useMutation({
    mutationFn: (warehouse: Warehouse) => {
      if (!token) throw new Error("Authentication required");
      return removeWarehouse(token, warehouse.id);
    },
    retry: 0,
    onSuccess: async (result) => {
      if (tenantId)
        await queryClient.invalidateQueries({
          queryKey: warehouseKeys.all(tenantId),
        });
      setLifecycleMessage(
        result.deleted
          ? "Warehouse deleted because it has no operational history."
          : "Warehouse deactivated to preserve its operational history.",
      );
    },
    onError: (cause) => {
      setLifecycleMessage(
        cause instanceof Error ? cause.message : "Unable to remove warehouse",
      );
    },
  });
  const statusMutation = useMutation({
    mutationFn: ({
      warehouse,
      isActive,
    }: {
      warehouse: Warehouse;
      isActive: boolean;
    }) => {
      if (!token) throw new Error("Authentication required");
      return updateWarehouse(token, warehouse.id, { isActive });
    },
    retry: 0,
    onSuccess: async () => {
      if (tenantId)
        await queryClient.invalidateQueries({
          queryKey: warehouseKeys.all(tenantId),
        });
      setLifecycleMessage("Warehouse status updated.");
    },
    onError: (cause) => {
      setLifecycleMessage(
        cause instanceof Error
          ? cause.message
          : "Unable to update warehouse status",
      );
    },
  });

  if (!canRead)
    return (
      <UnavailableState
        title="Warehouse access is restricted"
        description="Your current tenant session does not include the warehouse.read permission."
      />
    );
  if (query.isPending)
    return (
      <div className="space-y-3">
        <div className="h-20 animate-pulse rounded-3xl bg-muted" />
        <div className="h-64 animate-pulse rounded-3xl bg-muted" />
      </div>
    );
  if (query.isError) {
    const message =
      query.error instanceof ApiError && query.error.status === 403
        ? "Your session is not authorized to view warehouses."
        : "The Warehouses API could not be reached. No warehouse records are shown.";
    return (
      <UnavailableState
        title="Unable to load warehouses"
        description={message}
      />
    );
  }

  const warehouses = query.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Warehouse master data
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tenant-scoped warehouse locations returned by the backend.
          </p>
        </div>
        {lifecycleMessage ? (
          <p role="status" className="text-sm text-muted-foreground">
            {lifecycleMessage}
          </p>
        ) : null}
        {canCreate ? (
          <button
            type="button"
            onClick={() => {
              setEditingWarehouse(null);
              setIsCreateOpen((open) => !open);
            }}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            {isCreateOpen ? "Close form" : "New warehouse"}
          </button>
        ) : (
          <StatusBadge tone="neutral">Read only</StatusBadge>
        )}
      </div>

      {(isCreateOpen && canCreate) || (editingWarehouse && canUpdate) ? (
        <section className="rounded-3xl border border-border bg-card p-5">
          <SectionHeader
            eyebrow="Master data action"
            title={editingWarehouse ? "Update warehouse" : "Create warehouse"}
          />
          <WarehouseForm
            key={editingWarehouse?.id ?? "new"}
            warehouse={editingWarehouse ?? undefined}
            onSaved={(warehouseId) => {
              setIsCreateOpen(false);
              setEditingWarehouse(null);
              void queryClient.invalidateQueries({
                queryKey: warehouseKeys.all(tenantId ?? ""),
              });
              void queryClient.invalidateQueries({
                queryKey: warehouseKeys.detail(tenantId ?? "", warehouseId),
              });
              if (!editingWarehouse)
                router.push(`/app/warehouses/${warehouseId}`);
            }}
          />
        </section>
      ) : null}

      {!warehouses.length ? (
        <EmptyState
          title="No warehouses yet"
          description="This tenant has no warehouse records available from the current backend contract."
        />
      ) : (
        <>
          <section className="hidden overflow-hidden rounded-3xl border border-border bg-card md:block">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    {[
                      "Warehouse",
                      "Code",
                      "Outlet",
                      "Status",
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
                  {warehouses.map((warehouse) => (
                    <tr
                      key={warehouse.id}
                      className="border-t border-border transition-colors hover:bg-muted/50"
                    >
                      <td className="px-4 py-4">
                        <Link
                          href={`/app/warehouses/${warehouse.id}`}
                          className="font-semibold text-foreground hover:text-primary"
                        >
                          {warehouse.name}
                        </Link>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {warehouse.id}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {warehouse.code}
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {warehouse.outletId ?? "Tenant-wide"}
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge
                          tone={warehouse.isActive ? "success" : "neutral"}
                        >
                          {warehouse.isActive ? "Active" : "Inactive"}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {new Date(warehouse.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-3">
                          {canUpdate ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsCreateOpen(false);
                                  setEditingWarehouse(warehouse);
                                }}
                                className="text-sm font-semibold text-primary hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                disabled={statusMutation.isPending}
                                onClick={() =>
                                  statusMutation.mutate({
                                    warehouse,
                                    isActive: !warehouse.isActive,
                                  })
                                }
                                className="text-sm font-semibold text-primary hover:underline disabled:opacity-60"
                              >
                                {warehouse.isActive
                                  ? "Deactivate"
                                  : "Reactivate"}
                              </button>
                            </>
                          ) : null}
                          {canDelete ? (
                            <button
                              type="button"
                              disabled={removeMutation.isPending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Remove ${warehouse.name}? It will be deleted if unused or deactivated if it has operational history.`,
                                  )
                                ) {
                                  setLifecycleMessage(null);
                                  removeMutation.mutate(warehouse);
                                }
                              }}
                              className="text-sm font-semibold text-destructive hover:underline disabled:opacity-60"
                            >
                              Remove
                            </button>
                          ) : null}
                          {!canUpdate && !canDelete ? (
                            <span className="text-muted-foreground">-</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="space-y-3 md:hidden">
            {warehouses.map((warehouse) => (
              <article
                key={warehouse.id}
                className="rounded-2xl border border-border bg-card p-4"
              >
                <Link
                  href={`/app/warehouses/${warehouse.id}`}
                  className="block"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">
                        {warehouse.name}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Code: {warehouse.code}
                      </p>
                    </div>
                    <StatusBadge
                      tone={warehouse.isActive ? "success" : "neutral"}
                    >
                      {warehouse.isActive ? "Active" : "Inactive"}
                    </StatusBadge>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {warehouse.outletId
                      ? `Outlet: ${warehouse.outletId}`
                      : "Tenant-wide"}{" "}
                    · Created{" "}
                    {new Date(warehouse.createdAt).toLocaleDateString()}
                  </p>
                </Link>
                <div className="mt-3 flex flex-wrap gap-3">
                  {canUpdate ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreateOpen(false);
                          setEditingWarehouse(warehouse);
                        }}
                        className="text-sm font-semibold text-primary hover:underline"
                      >
                        Edit warehouse
                      </button>
                      <button
                        type="button"
                        disabled={statusMutation.isPending}
                        onClick={() =>
                          statusMutation.mutate({
                            warehouse,
                            isActive: !warehouse.isActive,
                          })
                        }
                        className="text-sm font-semibold text-primary hover:underline disabled:opacity-60"
                      >
                        {warehouse.isActive ? "Deactivate" : "Reactivate"}
                      </button>
                    </>
                  ) : null}
                  {canDelete ? (
                    <button
                      type="button"
                      disabled={removeMutation.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Remove ${warehouse.name}? It will be deleted if unused or deactivated if it has operational history.`,
                          )
                        ) {
                          setLifecycleMessage(null);
                          removeMutation.mutate(warehouse);
                        }
                      }}
                      className="text-sm font-semibold text-destructive hover:underline disabled:opacity-60"
                    >
                      Remove warehouse
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </section>
        </>
      )}

      <section className="rounded-3xl border border-border bg-card p-5">
        <SectionHeader eyebrow="Contract note" title="Inventory boundary" />
        <p className="text-sm text-muted-foreground">
          Warehouses with stock, movement, purchase-order, or transfer history
          are deactivated rather than deleted. Inactive warehouses remain
          available for historical review but cannot receive new manual stock
          movements, Purchase Orders, or transfers.
        </p>
      </section>
    </div>
  );
}
