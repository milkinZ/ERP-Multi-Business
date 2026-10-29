"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  PageHeader,
  SectionHeader,
  StatusBadge,
  UnavailableState,
} from "@/components/data-display/states";
import { ApiError } from "@/lib/api/client";
import {
  deleteSupplier,
  getSupplier,
  supplierKeys,
} from "@/features/erp/suppliers/api/queries";
import { SupplierForm } from "@/features/erp/suppliers/components/supplier-form";
import {
  getPurchaseOrders,
  purchaseOrderKeys,
} from "@/features/erp/purchase-orders/api/queries";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";

export default function SupplierDetailPage() {
  const { supplierId } = useParams<{ supplierId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const tenantId = session?.tenantId;
  const canRead = hasPermission(session, "supplier.read");
  const canUpdate = hasPermission(session, "supplier.update");
  const canDelete = hasPermission(session, "supplier.delete");
  const canReadPurchaseOrders = hasPermission(session, "purchase_order.read");
  const [isEditing, setIsEditing] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [purchaseOrderPage, setPurchaseOrderPage] = useState(0);

  const query = useQuery({
    queryKey: tenantId
      ? supplierKeys.detail(tenantId, supplierId)
      : ["suppliers", "unauthenticated", supplierId],
    queryFn: () => getSupplier(token as string, supplierId),
    enabled: Boolean(token && tenantId && canRead && supplierId),
    staleTime: 60_000,
  });
  const purchaseOrdersQuery = useQuery({
    queryKey: tenantId
      ? purchaseOrderKeys.list(tenantId, {
          supplierId,
          skip: purchaseOrderPage * 10,
          take: 10,
        })
      : ["purchase-orders", "unauthenticated", supplierId],
    queryFn: () =>
      getPurchaseOrders(token as string, {
        supplierId,
        skip: purchaseOrderPage * 10,
        take: 10,
      }),
    enabled: Boolean(
      token && tenantId && canRead && canReadPurchaseOrders && supplierId,
    ),
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!token) throw new Error("Authentication required");
      return deleteSupplier(token, supplierId);
    },
    retry: 0,
    onSuccess: async (result) => {
      if (tenantId) {
        await queryClient.invalidateQueries({
          queryKey: supplierKeys.all(tenantId),
        });
        if (result.deactivated) {
          await queryClient.invalidateQueries({
            queryKey: supplierKeys.detail(tenantId, supplierId),
          });
        } else {
          await queryClient.removeQueries({
            queryKey: supplierKeys.detail(tenantId, supplierId),
          });
        }
      }
      if (!result.deactivated) {
        router.push("/app/suppliers");
      }
    },
    onError: (cause) => {
      setServerError(
        cause instanceof ApiError &&
          (cause.status === 400 || cause.status === 409)
          ? "Supplier removal failed. Referenced supplier history is preserved; retry or refresh and contact an administrator if the problem continues."
          : cause instanceof Error
            ? cause.message
            : "Unable to delete supplier",
      );
    },
  });

  if (!canRead)
    return (
      <UnavailableState
        title="Supplier access is restricted"
        description="Your current tenant session does not include the supplier.read permission."
      />
    );
  if (query.isPending)
    return (
      <div className="h-48 animate-pulse rounded-3xl border border-border bg-card" />
    );
  if (query.isError)
    return (
      <UnavailableState
        title="Unable to load supplier"
        description={
          query.error instanceof ApiError &&
          (query.error.status === 400 || query.error.status === 404)
            ? "This supplier was not found in the current tenant."
            : "The Supplier detail API could not be reached."
        }
      />
    );
  if (!query.data)
    return (
      <UnavailableState
        title="Supplier not found"
        description="The API returned no supplier record for this tenant-scoped route."
      />
    );

  const supplier = query.data;
  const confirmDelete = () => {
    if (
      window.confirm(
        `Remove supplier ${supplier.name}? If Purchase Orders reference it, the supplier will be deactivated and history preserved; otherwise it will be deleted.`,
      )
    )
      deleteMutation.mutate();
  };

  return (
    <>
      <PageHeader
        eyebrow="Tenant application / master data"
        title={supplier.name}
        description="Supplier details returned by the tenant-scoped backend API."
        actions={
          <StatusBadge tone={supplier.isActive ? "success" : "neutral"}>
            {supplier.isActive ? "Active supplier" : "Inactive supplier"}
          </StatusBadge>
        }
      />
      {deleteMutation.data?.deactivated ? (
        <p
          role="status"
          className="mb-6 rounded-xl border border-[var(--success)]/30 bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]"
        >
          Supplier was deactivated because Purchase Orders reference it.
          Historical Purchase Orders are preserved, and new Purchase Orders
          cannot use this supplier.
        </p>
      ) : null}
      {serverError ? (
        <p
          role="alert"
          className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {serverError}
        </p>
      ) : null}
      {isEditing && canUpdate ? (
        <section className="rounded-3xl border border-border bg-card p-5">
          <SectionHeader eyebrow="Master data action" title="Edit supplier" />
          <SupplierForm
            supplier={supplier}
            onSaved={() => {
              setIsEditing(false);
              query.refetch();
            }}
          />
        </section>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Supplier ID
              </p>
              <p className="mt-2 break-all font-medium">{supplier.id}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Email
              </p>
              <p className="mt-2 font-medium">{supplier.email ?? "-"}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Phone
              </p>
              <p className="mt-2 font-medium">{supplier.phone ?? "-"}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 md:col-span-2 xl:col-span-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Address
              </p>
              <p className="mt-2 whitespace-pre-wrap font-medium">
                {supplier.address ?? "-"}
              </p>
            </div>
          </section>
          <section className="mt-6 rounded-3xl border border-border bg-card p-5">
            <SectionHeader
              eyebrow="Purchase Order relationship"
              title="Purchase Order history"
            />
            {!canReadPurchaseOrders ? (
              <p className="text-sm text-muted-foreground">
                Purchase Order history requires the purchase_order.read
                permission.
              </p>
            ) : purchaseOrdersQuery.isPending ? (
              <p className="text-sm text-muted-foreground">
                Loading supplier Purchase Orders...
              </p>
            ) : purchaseOrdersQuery.isError ? (
              <p role="alert" className="text-sm text-destructive">
                Unable to load Purchase Orders for this supplier.
              </p>
            ) : !purchaseOrdersQuery.data?.data.length ? (
              <p className="text-sm text-muted-foreground">
                No Purchase Orders were found for this supplier.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-muted text-muted-foreground">
                      <tr>
                        {[
                          "PO number",
                          "Status",
                          "Created",
                          "Total",
                          "Action",
                        ].map((heading) => (
                          <th
                            key={heading}
                            className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em]"
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseOrdersQuery.data.data.map((purchaseOrder) => (
                        <tr
                          key={purchaseOrder.id}
                          className="border-t border-border"
                        >
                          <td className="px-4 py-3 font-medium">
                            {purchaseOrder.poNumber}
                          </td>
                          <td className="px-4 py-3">{purchaseOrder.status}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {new Date(
                              purchaseOrder.createdAt,
                            ).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            {purchaseOrder.totalAmount}
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/app/purchase-orders/${encodeURIComponent(purchaseOrder.id)}`}
                              className="font-semibold text-primary hover:underline"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">
                    {purchaseOrdersQuery.data.pagination.total} Purchase Orders
                    · Page {purchaseOrderPage + 1} of{" "}
                    {purchaseOrdersQuery.data.pagination.pages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={
                        purchaseOrderPage <= 0 || purchaseOrdersQuery.isFetching
                      }
                      onClick={() => setPurchaseOrderPage((page) => page - 1)}
                      className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={
                        (purchaseOrderPage + 1) * 10 >=
                          purchaseOrdersQuery.data.pagination.total ||
                        purchaseOrdersQuery.isFetching
                      }
                      onClick={() => setPurchaseOrderPage((page) => page + 1)}
                      className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              Total amounts are shown as stored integer values; currency
              presentation, spend analytics, balances, and supplier performance
              are not available in the current contract.
            </p>
          </section>
          <div className="mt-6 flex flex-wrap gap-3">
            {canUpdate ? (
              <button
                type="button"
                onClick={() => {
                  setIsEditing(true);
                  setServerError(null);
                }}
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Edit supplier
              </button>
            ) : null}
            {canDelete ? (
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleteMutation.isPending}
                className="rounded-xl border border-destructive/30 px-4 py-2.5 text-sm font-semibold text-destructive transition hover:bg-destructive/10"
              >
                {deleteMutation.isPending ? "Removing..." : "Remove supplier"}
              </button>
            ) : null}
          </div>
        </>
      )}
      <Link
        href="/app/suppliers"
        className="mt-6 inline-flex text-sm font-semibold text-primary hover:underline"
      >
        Back to suppliers
      </Link>
    </>
  );
}
