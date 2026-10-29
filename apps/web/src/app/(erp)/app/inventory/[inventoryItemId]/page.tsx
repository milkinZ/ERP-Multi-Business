"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import {
  PageHeader,
  StatusBadge,
  UnavailableState,
} from "@/components/data-display/states";
import { ApiError } from "@/lib/api/client";
import { hasPermission } from "@/lib/permissions";
import {
  getInventoryHistoryForItem,
  getInventoryItem,
  inventoryKeys,
  type InventoryHistoryQuery,
  type InventoryMovementType,
} from "@/features/erp/inventory/api/queries";
import { InventoryStockBalances } from "@/features/erp/inventory/components/inventory-stock-balances";
import { InventoryValuationSettings } from "@/features/erp/inventory/components/inventory-valuation-settings";
import { useAuthStore } from "@/stores/auth.store";

export default function InventoryDetailPage() {
  const params = useParams<{ inventoryItemId: string }>();
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const tenantId = session?.tenantId;
  const canRead = hasPermission(session, "inventory.read");
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState<InventoryMovementType | "">("");
  const [sortBy, setSortBy] =
    useState<NonNullable<InventoryHistoryQuery["sortBy"]>>("createdAt");
  const [sortOrder, setSortOrder] =
    useState<NonNullable<InventoryHistoryQuery["sortOrder"]>>("desc");
  const movementTypes: InventoryMovementType[] = [
    "STOCK_IN",
    "SALE",
    "WASTE",
    "ADJUSTMENT",
    "RETURN",
    "STOCK_OUT",
    "PURCHASE",
    "CONSUMPTION",
    "PRODUCTION",
    "TRANSFER",
  ];
  const historyQueryParams: InventoryHistoryQuery = {
    page,
    limit: 20,
    ...(search ? { search } : {}),
    ...(type ? { type } : {}),
    sortBy,
    sortOrder,
  };

  const itemQuery = useQuery({
    queryKey: tenantId
      ? inventoryKeys.item(tenantId, params.inventoryItemId)
      : ["inventory-item", "unauthenticated", params.inventoryItemId],
    queryFn: () => getInventoryItem(token as string, params.inventoryItemId),
    enabled: Boolean(token && tenantId && canRead && params.inventoryItemId),
    staleTime: 15_000,
  });

  const historyQuery = useQuery({
    queryKey: tenantId
      ? inventoryKeys.itemHistory(
          tenantId,
          params.inventoryItemId,
          historyQueryParams,
        )
      : ["inventory-history", "unauthenticated", params.inventoryItemId],
    queryFn: () =>
      getInventoryHistoryForItem(
        token as string,
        params.inventoryItemId,
        historyQueryParams,
      ),
    enabled: Boolean(token && tenantId && canRead && params.inventoryItemId),
    staleTime: 15_000,
  });

  if (!canRead) {
    return (
      <UnavailableState
        title="Inventory access is restricted"
        description="Your current tenant session does not include the inventory.read permission."
      />
    );
  }

  if (itemQuery.isPending || historyQuery.isPending) {
    return (
      <div className="h-48 animate-pulse rounded-3xl border border-border bg-[var(--panel)]" />
    );
  }

  if (itemQuery.isError || historyQuery.isError) {
    const cause = itemQuery.isError ? itemQuery.error : historyQuery.error;
    const message =
      cause instanceof ApiError && cause.status === 403
        ? "Your session is not authorized to view this inventory record."
        : "The inventory detail API could not be reached.";

    return (
      <UnavailableState
        title="Unable to load inventory item"
        description={message}
      />
    );
  }

  const item = itemQuery.data;
  if (!item) {
    return (
      <UnavailableState
        title="Inventory item not found"
        description="The API returned no inventory item for this route."
      />
    );
  }

  const movements = historyQuery.data?.data ?? [];
  const pagination = historyQuery.data?.pagination;

  return (
    <>
      <PageHeader
        eyebrow="Tenant application / stock"
        title={item.name}
        description="Inventory item detail and movement history returned by the backend tenant-scoped API."
        actions={
          <StatusBadge tone={item.isActive ? "success" : "neutral"}>
            {item.isActive ? "Active" : "Inactive"}
          </StatusBadge>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            Code
          </p>
          <p className="mt-2 font-medium">{item.code}</p>
        </div>
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            Type
          </p>
          <p className="mt-2 font-medium">{item.type}</p>
        </div>
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            Unit
          </p>
          <p className="mt-2 font-medium">{item.unit ?? "—"}</p>
        </div>
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            Tenant
          </p>
          <p className="mt-2 break-all font-medium">{item.tenantId}</p>
        </div>
      </section>

      <InventoryStockBalances inventoryItemId={item.id} />
      <InventoryValuationSettings inventoryItemId={item.id} />

      <section className="mt-6 rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          Description
        </p>
        <p className="mt-3 text-sm leading-7 text-[var(--muted-foreground)]">
          {item.description || "No description was returned by the backend."}
        </p>
      </section>

      <section className="mt-6 rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          Movement history
        </p>
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setSearch(searchDraft.trim());
          }}
        >
          <label className="text-sm font-medium text-[var(--foreground)]">
            Search
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              maxLength={100}
              placeholder="Movement note"
              className="mt-1 h-10 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3"
            />
          </label>
          <label className="text-sm font-medium text-[var(--foreground)]">
            Sort by
            <select
              value={sortBy}
              onChange={(event) => {
                setPage(1);
                setSortBy(
                  (["createdAt", "quantity", "type"] as const).find(
                    (value) => value === event.target.value,
                  ) ?? "createdAt",
                );
              }}
              className="mt-1 h-10 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3"
            >
              <option value="createdAt">Created date</option>
              <option value="quantity">Quantity</option>
              <option value="type">Movement type</option>
            </select>
          </label>
          <label className="text-sm font-medium text-[var(--foreground)]">
            Order
            <select
              value={sortOrder}
              onChange={(event) => {
                setPage(1);
                setSortOrder(event.target.value === "asc" ? "asc" : "desc");
              }}
              className="mt-1 h-10 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3"
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </label>
          <label className="text-sm font-medium text-[var(--foreground)]">
            Movement type
            <select
              value={type}
              onChange={(event) => {
                setPage(1);
                setType(
                  movementTypes.find(
                    (movementType) => movementType === event.target.value,
                  ) ?? "",
                );
              }}
              className="mt-1 h-10 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3"
            >
              <option value="">All movement types</option>
              {movementTypes.map((movementType) => (
                <option key={movementType} value={movementType}>
                  {movementType}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="h-10 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-white"
          >
            Search
          </button>
        </form>
        {!movements.length ? (
          <p className="mt-3 text-sm text-[var(--muted-foreground)]">
            No movement history was returned for this inventory item.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {movements.map((movement) => (
              <div
                key={movement.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-[var(--foreground)]">
                      {movement.type}
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {movement.note ?? "No note provided"}
                    </p>
                  </div>
                  <div className="text-right text-xs text-[var(--muted-foreground)]">
                    <p>{new Date(movement.createdAt).toLocaleString()}</p>
                    <p>Qty: {movement.quantity}</p>
                  </div>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={(pagination?.page ?? page) <= 1}
                onClick={() => setPage((current) => current - 1)}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-[var(--muted-foreground)]">
                Page {pagination?.page ?? page} of{" "}
                {Math.max(pagination?.totalPages ?? 0, 1)}
              </span>
              <button
                type="button"
                disabled={
                  (pagination?.page ?? page) >= (pagination?.totalPages ?? 0)
                }
                onClick={() => setPage((current) => current + 1)}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      <Link
        href="/app/inventory"
        className="mt-6 inline-flex text-sm font-semibold text-[var(--primary)] hover:underline"
      >
        Back to inventory
      </Link>
    </>
  );
}
