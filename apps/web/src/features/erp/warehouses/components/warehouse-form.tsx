"use client";

import React, { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import {
  createWarehouse,
  updateWarehouse,
  warehouseKeys,
  type Warehouse,
} from "@/features/erp/warehouses/api/queries";
import { getOutlets, outletKeys } from "@/features/erp/outlets/api/queries";
import { hasPermission } from "@/lib/permissions";
import {
  warehouseSchema,
  type WarehouseFormValues,
} from "@/features/erp/warehouses/schemas/warehouse.schema";
import { useAuthStore } from "@/stores/auth.store";

export function WarehouseForm({
  warehouse,
  onSaved,
}: {
  warehouse?: Warehouse;
  onSaved: (warehouseId: string) => void;
}) {
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const tenantId = session?.tenantId;
  const canReadOutlets = hasPermission(session, "outlet.read");
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const isEditing = Boolean(warehouse);
  const outletsQuery = useQuery({
    queryKey: tenantId
      ? outletKeys.list(tenantId, { page: 1, limit: 100, status: "ACTIVE" })
      : ["outlets", "unauthenticated"],
    queryFn: () =>
      getOutlets(token as string, { page: 1, limit: 100, status: "ACTIVE" }),
    enabled: Boolean(token && tenantId && canReadOutlets),
    staleTime: 60_000,
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      name: warehouse?.name ?? "",
      outletId: warehouse?.outletId ?? "",
    },
  });
  useEffect(() => {
    reset({ name: warehouse?.name ?? "", outletId: warehouse?.outletId ?? "" });
    setServerError(null);
  }, [reset, warehouse]);

  const mutation = useMutation({
    mutationFn: (values: WarehouseFormValues) => {
      if (!token) throw new Error("Authentication required");
      return warehouse
        ? updateWarehouse(token, warehouse.id, {
            name: values.name,
            ...(canReadOutlets ? { outletId: values.outletId || null } : {}),
          })
        : createWarehouse(token, {
            name: values.name,
            ...(canReadOutlets && values.outletId
              ? { outletId: values.outletId }
              : {}),
          });
    },
    retry: 0,
    onSuccess: async (warehouse) => {
      if (tenantId)
        await queryClient.invalidateQueries({
          queryKey: warehouseKeys.all(tenantId),
        });
      if (tenantId)
        await queryClient.invalidateQueries({
          queryKey: outletKeys.all(tenantId),
        });
      await queryClient.invalidateQueries({
        queryKey: warehouseKeys.detail(tenantId ?? "", warehouse.id),
      });
      reset();
      setServerError(null);
      onSaved(warehouse.id);
    },
    onError: (cause) => {
      if (cause instanceof ApiError && cause.status === 403) {
        setServerError(
          `You do not have permission to ${isEditing ? "update" : "create"} warehouses.`,
        );
        return;
      }
      if (
        cause instanceof ApiError &&
        (cause.status === 400 || cause.status === 404 || cause.status === 409)
      ) {
        setServerError(
          `The warehouse could not be ${isEditing ? "updated" : "created"}. Check the name and outlet reference, then try again.`,
        );
        return;
      }
      setServerError(
        cause instanceof Error
          ? cause.message
          : `Unable to ${isEditing ? "update" : "create"} warehouse`,
      );
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      className="space-y-4"
      noValidate
    >
      <label className="block text-sm font-medium text-foreground">
        Name
        <input
          {...register("name")}
          aria-invalid={Boolean(errors.name)}
          className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring"
        />
        {errors.name ? (
          <span className="mt-1 block text-xs text-destructive">
            {errors.name.message}
          </span>
        ) : null}
      </label>
      <label className="block text-sm font-medium text-foreground">
        Outlet{" "}
        <span className="font-normal text-muted-foreground">(optional)</span>
        {canReadOutlets ? (
          <>
            <select
              {...register("outletId")}
              disabled={outletsQuery.isPending || outletsQuery.isError}
              aria-invalid={Boolean(errors.outletId)}
              className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-60"
            >
              <option value="">Tenant-wide</option>
              {warehouse?.outletId &&
              !outletsQuery.data?.data.some(
                (outlet) => outlet.id === warehouse.outletId,
              ) ? (
                <option value={warehouse.outletId}>
                  Current outlet ({warehouse.outletId})
                </option>
              ) : null}
              {outletsQuery.data?.data.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.name}
                </option>
              ))}
            </select>
            {outletsQuery.isError ? (
              <span
                role="alert"
                className="mt-1 block text-xs text-destructive"
              >
                Outlet options could not be loaded; try again before changing
                the outlet assignment.
              </span>
            ) : null}
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {warehouse?.outletId
              ? `Current outlet: ${warehouse.outletId}. You need outlet.read to change this assignment.`
              : "Tenant-wide. You need outlet.read to assign an outlet."}
          </p>
        )}
        <span className="mt-1 block text-xs font-normal text-muted-foreground">
          Only active outlets belonging to this tenant are selectable.
        </span>
        {errors.outletId ? (
          <span className="mt-1 block text-xs text-destructive">
            {errors.outletId.message}
          </span>
        ) : null}
      </label>
      {serverError ? (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={mutation.isPending || !token}
        className="w-full"
      >
        {mutation.isPending
          ? isEditing
            ? "Saving warehouse..."
            : "Creating warehouse..."
          : isEditing
            ? "Save warehouse"
            : "Create warehouse"}
      </Button>
    </form>
  );
}
