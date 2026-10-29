"use client";

import Link from "next/link";
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  EmptyState,
  SectionHeader,
  StatusBadge,
  UnavailableState,
} from "@/components/data-display/states";
import { ApiError } from "@/lib/api/client";
import {
  getPurchasePriceVariances,
  purchaseOrderKeys,
} from "@/features/erp/purchase-orders/api/queries";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";

function formatCurrency(value: number | string, currencyCode: string | null) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return currencyCode
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currencyCode,
        maximumFractionDigits: 2,
      }).format(amount)
    : new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 2,
      }).format(amount);
}

export function PurchasePriceVarianceReport() {
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const tenantId = session?.tenantId;
  const canRead = hasPermission(session, "purchase_order.read");
  const [page, setPage] = useState(1);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const pageSize = 20;
  const invalidDateRange = Boolean(fromDate && toDate && fromDate > toDate);
  const filters = {
    skip: (page - 1) * pageSize,
    take: pageSize,
    ...(fromDate ? { fromDate } : {}),
    ...(toDate ? { toDate } : {}),
  };
  const query = useQuery({
    queryKey: tenantId
      ? purchaseOrderKeys.priceVariances(tenantId, filters)
      : ["purchase-orders", "unauthenticated", "price-variances"],
    queryFn: () => getPurchasePriceVariances(token as string, filters),
    enabled: Boolean(token && tenantId && canRead && !invalidDateRange),
    staleTime: 30_000,
  });

  if (!canRead) return null;
  if (query.isPending) {
    return (
      <section className="h-48 animate-pulse rounded-3xl border border-border bg-card" />
    );
  }
  if (query.isError) {
    return (
      <UnavailableState
        title="Unable to load purchase price variances"
        description={
          query.error instanceof ApiError && query.error.status === 403
            ? "Your session is not authorized to view purchase price variances."
            : "The variance report could not be reached. No accounting entries were created."
        }
      />
    );
  }

  const report = query.data;
  return (
    <section className="space-y-4 rounded-3xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionHeader
            eyebrow="Standard cost monitoring"
            title="Purchase price variance"
          />
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Variance is actual PO unit price minus the standard cost captured at
            receipt, multiplied by received quantity. Positive amounts are
            unfavorable; negative amounts are favorable. This operational
            register is not posted to accounting.
          </p>
        </div>
        <StatusBadge tone="warning">Not posted to accounting</StatusBadge>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium text-foreground">
          Receipt from
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
          Receipt to
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
      </div>
      {invalidDateRange ? (
        <p role="alert" className="text-sm text-destructive">
          The start date must not be later than the end date.
        </p>
      ) : null}

      {report.totals.length ? (
        <div className="flex flex-wrap gap-3">
          {report.totals.map((total) => (
            <div
              key={total.currencyCode ?? "no-currency"}
              className="rounded-xl border border-border px-4 py-3"
            >
              <p className="text-xs text-muted-foreground">
                {total.currencyCode ?? "Unspecified currency"} · {total.count}{" "}
                receipt lines · total variance
              </p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {formatCurrency(total.varianceAmount, total.currencyCode)}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {!report.data.length ? (
        <EmptyState
          title="No standard-cost variances"
          description="No standard-cost purchase receipts were found for this tenant and date range."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                {[
                  "Receipt date",
                  "Purchase order",
                  "Supplier",
                  "Inventory item",
                  "Warehouse",
                  "Quantity",
                  "Standard",
                  "Actual",
                  "Variance",
                  "Posting",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.data.map((entry) => {
                const variance = Number(entry.varianceAmount);
                return (
                  <tr key={entry.id} className="border-t border-border">
                    <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                      {new Date(entry.Receipt.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/app/purchase-orders/${entry.PurchaseOrder.id}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {entry.PurchaseOrder.poNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      {entry.PurchaseOrder.Supplier.name}
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-medium">
                        {entry.InventoryItem.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {entry.InventoryItem.code}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {entry.Warehouse?.name ?? "Unassigned"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {entry.quantity} {entry.InventoryItem.unit ?? ""}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {formatCurrency(
                        entry.standardUnitCost,
                        entry.currencyCode,
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {formatCurrency(entry.actualUnitCost, entry.currencyCode)}
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-3 font-semibold ${
                        variance > 0
                          ? "text-destructive"
                          : variance < 0
                            ? "text-emerald-700"
                            : "text-foreground"
                      }`}
                    >
                      {formatCurrency(entry.varianceAmount, entry.currencyCode)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <StatusBadge tone="warning">Not posted</StatusBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {report.pagination.total > 0 ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            {report.pagination.total} receipt lines · Page {page} of{" "}
            {Math.max(report.pagination.pages, 1)}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || query.isFetching}
              onClick={() => setPage((current) => current - 1)}
              className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= report.pagination.pages || query.isFetching}
              onClick={() => setPage((current) => current + 1)}
              className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
