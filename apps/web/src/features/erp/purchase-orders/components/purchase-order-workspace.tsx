"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import {
  EmptyState,
  SectionHeader,
  StatusBadge,
  UnavailableState,
} from "@/components/data-display/states";
import { ApiError } from "@/lib/api/client";
import {
  getAllInventoryItems,
  inventoryKeys,
} from "@/features/erp/inventory/api/queries";
import {
  getSuppliers,
  supplierKeys,
} from "@/features/erp/suppliers/api/queries";
import {
  getWarehouses,
  warehouseKeys,
} from "@/features/erp/warehouses/api/queries";
import { PurchaseOrderForm } from "@/features/erp/purchase-orders/components/purchase-order-form";
import { PurchasePriceVarianceReport } from "@/features/erp/purchase-orders/components/purchase-price-variance-report";
import {
  getPurchaseOrders,
  purchaseOrderKeys,
  type PurchaseOrderStatus,
} from "@/features/erp/purchase-orders/api/queries";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";

const statuses: PurchaseOrderStatus[] = [
  "DRAFT",
  "PENDING",
  "APPROVED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
];

function statusTone(status: PurchaseOrderStatus) {
  if (status === "COMPLETED" || status === "RECEIVED")
    return "success" as const;
  if (status === "CANCELLED" || status === "REJECTED") return "danger" as const;
  if (status === "APPROVED" || status === "PARTIALLY_RECEIVED")
    return "info" as const;
  return "warning" as const;
}

function formatAmount(value: number, currencyCode?: string | null) {
  return currencyCode
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currencyCode,
        maximumFractionDigits: 0,
      }).format(value)
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
        value,
      );
}

export function PurchaseOrderWorkspace() {
  const router = useRouter();
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const tenantId = session?.tenantId;
  const canRead = hasPermission(session, "purchase_order.read");
  const canCreate = hasPermission(session, "purchase_order.create");
  const canReadSuppliers = hasPermission(session, "supplier.read");
  const canReadWarehouses = hasPermission(session, "warehouse.read");
  const canReadInventory = hasPermission(session, "inventory.read");
  const [status, setStatus] = useState<PurchaseOrderStatus | "">("");
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortBy, setSortBy] = useState<
    "createdAt" | "expectedDeliveryDate" | "totalAmount" | "poNumber"
  >("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const invalidDateRange = Boolean(fromDate && toDate && fromDate > toDate);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const pageSize = 20;
  const filters = {
    ...(status ? { status } : {}),
    ...(search ? { search } : {}),
    ...(fromDate ? { fromDate } : {}),
    ...(toDate ? { toDate } : {}),
    sortBy,
    sortOrder,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };

  const suppliersQuery = useQuery({
    queryKey: tenantId
      ? supplierKeys.options(tenantId)
      : ["suppliers", "unauthenticated"],
    queryFn: () => getSuppliers(token as string),
    enabled: Boolean(token && tenantId && canRead && canReadSuppliers),
    staleTime: 60_000,
  });
  const warehousesQuery = useQuery({
    queryKey: tenantId
      ? warehouseKeys.all(tenantId)
      : ["warehouses", "unauthenticated"],
    queryFn: () => getWarehouses(token as string),
    enabled: Boolean(token && tenantId && canRead && canReadWarehouses),
    staleTime: 60_000,
  });
  const inventoryQuery = useQuery({
    queryKey: tenantId
      ? inventoryKeys.all(tenantId)
      : ["inventory", "unauthenticated"],
    queryFn: () => getAllInventoryItems(token as string),
    enabled: Boolean(token && tenantId && canRead && canReadInventory),
    staleTime: 15_000,
  });
  const ordersQuery = useQuery({
    queryKey: tenantId
      ? purchaseOrderKeys.list(tenantId, filters)
      : ["purchase-orders", "unauthenticated"],
    queryFn: () => getPurchaseOrders(token as string, filters),
    enabled: Boolean(token && tenantId && canRead && !invalidDateRange),
    staleTime: 30_000,
  });

  if (!canRead)
    return (
      <UnavailableState
        title="Purchase Order access is restricted"
        description="Your current tenant session does not include the purchase_order.read permission."
      />
    );
  if (!canReadSuppliers || !canReadWarehouses || !canReadInventory)
    return (
      <UnavailableState
        title="Purchase Order dependencies are restricted"
        description="Creating and interpreting Purchase Orders requires Supplier, Warehouse, and Inventory read permissions."
      />
    );
  if (
    suppliersQuery.isPending ||
    warehousesQuery.isPending ||
    inventoryQuery.isPending ||
    ordersQuery.isPending
  )
    return (
      <div className="space-y-3">
        <div className="h-20 animate-pulse rounded-3xl bg-muted" />
        <div className="h-64 animate-pulse rounded-3xl bg-muted" />
      </div>
    );
  if (
    suppliersQuery.isError ||
    warehousesQuery.isError ||
    inventoryQuery.isError ||
    ordersQuery.isError
  )
    return (
      <UnavailableState
        title="Unable to load Purchase Orders"
        description={
          [
            suppliersQuery.error,
            warehousesQuery.error,
            inventoryQuery.error,
            ordersQuery.error,
          ].some((error) => error instanceof ApiError && error.status === 403)
            ? "Your session is not authorized to read a required Purchase Order dependency."
            : "A required Purchase Order API could not be reached. No placeholder data is shown."
        }
      />
    );

  const suppliers = suppliersQuery.data ?? [];
  const warehouses = warehousesQuery.data ?? [];
  const inventoryItems = inventoryQuery.data ?? [];
  const orders = ordersQuery.data?.data ?? [];
  const pagination = ordersQuery.data?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Purchase Order transactions
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Backend-authoritative supplier orders and lifecycle state.
          </p>
        </div>
        {canCreate ? (
          <button
            type="button"
            onClick={() => setIsCreateOpen((open) => !open)}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            {isCreateOpen ? "Close form" : "New Purchase Order"}
          </button>
        ) : (
          <StatusBadge tone="neutral">Read only</StatusBadge>
        )}
      </div>
      {isCreateOpen && canCreate ? (
        <section className="rounded-3xl border border-border bg-card p-5">
          <SectionHeader
            eyebrow="Transaction action"
            title="Create Purchase Order"
          />
          <PurchaseOrderForm
            suppliers={suppliers}
            warehouses={warehouses}
            inventoryItems={inventoryItems}
            onSaved={(id) => {
              setIsCreateOpen(false);
              router.push(`/app/purchase-orders/${id}`);
            }}
          />
        </section>
      ) : null}
      <PurchasePriceVarianceReport />
      <section className="rounded-3xl border border-border bg-card p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeader
            eyebrow="Backend list contract"
            title="Purchase Orders"
          />
          <label className="text-sm font-medium text-foreground">
            Status
            <select
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value as PurchaseOrderStatus | "");
              }}
              className="mt-2 h-10 rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            >
              <option value="">All statuses</option>
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
        <form
          className="mb-5 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setSearch(searchDraft.trim());
          }}
        >
          <label className="text-sm font-medium text-foreground">
            Search
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              maxLength={100}
              placeholder="PO number or supplier"
              className="mt-2 h-10 rounded-xl border border-border bg-card px-3"
            />
          </label>
          <label className="text-sm font-medium text-foreground">
            Created from
            <input
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(event) => {
                setPage(1);
                setFromDate(event.target.value);
              }}
              className="mt-2 h-10 rounded-xl border border-border bg-card px-3"
            />
          </label>
          <label className="text-sm font-medium text-foreground">
            Created to
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(event) => {
                setPage(1);
                setToDate(event.target.value);
              }}
              className="mt-2 h-10 rounded-xl border border-border bg-card px-3"
            />
          </label>
          <label className="text-sm font-medium text-foreground">
            Sort by
            <select
              value={sortBy}
              onChange={(event) => {
                setPage(1);
                setSortBy(
                  (
                    [
                      "createdAt",
                      "expectedDeliveryDate",
                      "totalAmount",
                      "poNumber",
                    ] as const
                  ).find((value) => value === event.target.value) ??
                    "createdAt",
                );
              }}
              className="mt-2 h-10 rounded-xl border border-border bg-card px-3"
            >
              <option value="createdAt">Created date</option>
              <option value="expectedDeliveryDate">Expected delivery</option>
              <option value="totalAmount">Total amount</option>
              <option value="poNumber">PO number</option>
            </select>
          </label>
          <label className="text-sm font-medium text-foreground">
            Order
            <select
              value={sortOrder}
              onChange={(event) => {
                setPage(1);
                setSortOrder(event.target.value === "asc" ? "asc" : "desc");
              }}
              className="mt-2 h-10 rounded-xl border border-border bg-card px-3"
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </label>
          <button
            type="submit"
            className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-white"
          >
            Search
          </button>
        </form>
        {invalidDateRange ? (
          <p role="alert" className="mb-4 text-sm text-destructive">
            The start date must not be later than the end date.
          </p>
        ) : null}
        {!orders.length ? (
          <EmptyState
            title="No Purchase Orders"
            description="The backend returned no Purchase Orders for this tenant and filter."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  {[
                    "PO number",
                    "Supplier",
                    "Warehouse",
                    "Total",
                    "Status",
                    "Created",
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
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-t border-border hover:bg-muted/50"
                  >
                    <td className="px-4 py-4">
                      <Link
                        href={`/app/purchase-orders/${order.id}`}
                        className="font-semibold text-foreground hover:text-primary"
                      >
                        {order.poNumber}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {order.id}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">
                      {order.Supplier?.name ?? order.supplierId}
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">
                      {order.Warehouse?.name ?? order.warehouseId ?? "-"}
                    </td>
                    <td className="px-4 py-4 font-medium text-foreground">
                      {formatAmount(order.totalAmount, order.currencyCode)}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge tone={statusTone(order.status)}>
                        {order.status}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pagination ? (
          <div className="mt-4 flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              {pagination.total} Purchase Order
              {pagination.total === 1 ? "" : "s"} · Page {page} of{" "}
              {Math.max(pagination.pages, 1)}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || ordersQuery.isFetching}
                onClick={() => setPage((value) => value - 1)}
                className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= pagination.pages || ordersQuery.isFetching}
                onClick={() => setPage((value) => value + 1)}
                className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
