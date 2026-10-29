"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import {
  EmptyState,
  SectionHeader,
  StatusBadge,
  UnavailableState,
} from "@/components/data-display/states";
import { ApiError } from "@/lib/api/client";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";
import {
  getAllInventoryItems,
  getInventoryHistory,
  getInventoryItems,
  inventoryKeys,
  type InventoryHistoryQuery,
  type InventoryItemQuery,
  type InventoryItem,
  type InventoryMovementType,
} from "@/features/erp/inventory/api/queries";
import { InventoryMutationForm } from "@/features/erp/inventory/components/inventory-mutation-form";
import {
  getWarehouses,
  warehouseKeys,
} from "@/features/erp/warehouses/api/queries";
import type { Warehouse } from "@/features/erp/warehouses/api/queries";

function statusTone(item: InventoryItem) {
  return item.isActive ? "success" : "neutral";
}

const inventoryItemTypes: InventoryItem["type"][] = [
  "PRODUCT",
  "INGREDIENT",
  "MATERIAL",
  "ASSET",
  "SUPPLY",
  "SERVICE",
];

const inventoryMovementTypes: InventoryMovementType[] = [
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

function PaginationControls({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-end gap-3">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50"
      >
        Previous
      </button>
      <span className="text-sm text-[var(--muted-foreground)]">
        Page {page} of {Math.max(totalPages, 1)}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50"
      >
        Next
      </button>
    </div>
  );
}

function WarehouseFilter({
  warehouses,
  value,
  onChange,
  isPending,
  isError,
}: {
  warehouses: Warehouse[];
  value: string;
  onChange: (value: string) => void;
  isPending: boolean;
  isError: boolean;
}) {
  return (
    <label className="text-sm font-medium text-[var(--foreground)]">
      Warehouse
      <select
        value={value}
        disabled={isPending || isError}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3"
      >
        <option value="">All warehouses</option>
        {warehouses.map((warehouse) => (
          <option key={warehouse.id} value={warehouse.id}>
            {warehouse.name} ({warehouse.code})
          </option>
        ))}
      </select>
      {isError ? (
        <span className="mt-1 block text-xs text-destructive">
          Warehouse filters are unavailable.
        </span>
      ) : null}
    </label>
  );
}

export function InventoryWorkspace() {
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const tenantId = session?.tenantId;
  const canRead = hasPermission(session, "inventory.read");
  const canAdjust = hasPermission(session, "inventory.adjust");
  const canReadWarehouses = hasPermission(session, "warehouse.read");
  const [itemPage, setItemPage] = useState(1);
  const [itemSearchDraft, setItemSearchDraft] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [itemType, setItemType] = useState<InventoryItem["type"] | "">("");
  const [itemWarehouseId, setItemWarehouseId] = useState("");
  const [itemSortBy, setItemSortBy] =
    useState<NonNullable<InventoryItemQuery["sortBy"]>>("createdAt");
  const [itemSortOrder, setItemSortOrder] =
    useState<NonNullable<InventoryItemQuery["sortOrder"]>>("desc");
  const [historyPage, setHistoryPage] = useState(1);
  const [historySearchDraft, setHistorySearchDraft] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyType, setHistoryType] = useState<InventoryMovementType | "">(
    "",
  );
  const [historyWarehouseId, setHistoryWarehouseId] = useState("");
  const [historySortBy, setHistorySortBy] =
    useState<NonNullable<InventoryHistoryQuery["sortBy"]>>("createdAt");
  const [historySortOrder, setHistorySortOrder] =
    useState<NonNullable<InventoryHistoryQuery["sortOrder"]>>("desc");
  const itemQuery: InventoryItemQuery = {
    page: itemPage,
    limit: 20,
    ...(itemSearch ? { search: itemSearch } : {}),
    ...(itemType ? { type: itemType } : {}),
    ...(itemWarehouseId ? { warehouseId: itemWarehouseId } : {}),
    sortBy: itemSortBy,
    sortOrder: itemSortOrder,
  };
  const historyQueryParams: InventoryHistoryQuery = {
    page: historyPage,
    limit: 20,
    ...(historySearch ? { search: historySearch } : {}),
    ...(historyType ? { type: historyType } : {}),
    ...(historyWarehouseId ? { warehouseId: historyWarehouseId } : {}),
    sortBy: historySortBy,
    sortOrder: historySortOrder,
  };

  const itemsQuery = useQuery({
    queryKey: tenantId
      ? inventoryKeys.list(tenantId, itemQuery)
      : ["inventory", "unauthenticated"],
    queryFn: () => getInventoryItems(token as string, itemQuery),
    enabled: Boolean(token && tenantId && canRead),
    staleTime: 15_000,
  });

  const allItemsQuery = useQuery({
    queryKey: tenantId
      ? inventoryKeys.all(tenantId)
      : ["inventory", "unauthenticated", "all"],
    queryFn: () => getAllInventoryItems(token as string),
    enabled: Boolean(token && tenantId && canRead && canAdjust),
    staleTime: 15_000,
  });

  const historyQuery = useQuery({
    queryKey: tenantId
      ? inventoryKeys.history(tenantId, historyQueryParams)
      : ["inventory-history", "unauthenticated"],
    queryFn: () => getInventoryHistory(token as string, historyQueryParams),
    enabled: Boolean(token && tenantId && canRead),
    staleTime: 15_000,
  });

  const warehousesQuery = useQuery({
    queryKey: tenantId
      ? warehouseKeys.all(tenantId)
      : ["warehouses", "unauthenticated"],
    queryFn: () => getWarehouses(token as string),
    enabled: Boolean(token && tenantId && canRead && canReadWarehouses),
    staleTime: 60_000,
  });

  if (!canRead) {
    return (
      <UnavailableState
        title="Inventory access is restricted"
        description="Your current tenant session does not include the inventory.read permission."
      />
    );
  }

  if (itemsQuery.isPending || historyQuery.isPending) {
    return (
      <div className="space-y-3">
        <div className="h-20 animate-pulse rounded-[24px] bg-[var(--muted)]" />
        <div className="h-64 animate-pulse rounded-[24px] bg-[var(--muted)]" />
      </div>
    );
  }

  if (itemsQuery.isError || historyQuery.isError) {
    const error = itemsQuery.isError ? itemsQuery.error : historyQuery.error;
    const message =
      error instanceof ApiError && error.status === 403
        ? "Your session is not authorized to view inventory records."
        : "The Inventory API could not be reached. No stock data is shown.";

    return (
      <UnavailableState
        title="Unable to load inventory"
        description={message}
      />
    );
  }

  const items = itemsQuery.data?.data ?? [];
  const movements = historyQuery.data?.data ?? [];
  const itemPagination = itemsQuery.data?.pagination;
  const historyPagination = historyQuery.data?.pagination;
  const warehouses = warehousesQuery.data ?? [];

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5">
        <div>
          <p className="font-semibold text-[var(--foreground)]">
            Move stock between warehouses
          </p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Create, ship, and partially receive tenant-scoped transfers.
          </p>
        </div>
        <Link
          href="/app/inventory/transfers"
          className="rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white"
        >
          Warehouse transfers
        </Link>
      </section>
      {canAdjust ? (
        <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <SectionHeader
            eyebrow="Inventory mutation"
            title="Stock operations"
          />
          <p className="mb-5 text-sm text-[var(--muted-foreground)]">
            Stock-in, adjustment, and waste are submitted to the backend. Sales
            and consumption movements remain backend-generated through order
            fulfillment.
          </p>
          {allItemsQuery.isPending ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Loading inventory items...
            </p>
          ) : allItemsQuery.isError ? (
            <UnavailableState
              title="Unable to load items for stock operations"
              description="The complete inventory item list could not be loaded. No items are available for selection."
            />
          ) : (
            <InventoryMutationForm
              items={allItemsQuery.data}
              onSaved={() => undefined}
            />
          )}
        </section>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
            Inventory items
          </p>
          <p className="mt-3 text-2xl font-semibold text-[var(--foreground)]">
            {itemPagination?.total ?? 0}
          </p>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Matching tenant-scoped records
          </p>
        </div>
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
            Movement events
          </p>
          <p className="mt-3 text-2xl font-semibold text-[var(--foreground)]">
            {historyPagination?.total ?? 0}
          </p>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Matching tenant-scoped movement events
          </p>
        </div>
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
            Active records
          </p>
          <p className="mt-3 text-2xl font-semibold text-[var(--foreground)]">
            {items.filter((item) => item.isActive).length}
          </p>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Active records on this page
          </p>
        </div>
      </div>

      <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5">
        <SectionHeader eyebrow="Inventory catalog" title="Inventory items" />
        <form
          className="mb-5 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setItemPage(1);
            setItemSearch(itemSearchDraft.trim());
          }}
        >
          <label className="text-sm font-medium text-[var(--foreground)]">
            Search
            <input
              value={itemSearchDraft}
              onChange={(event) => setItemSearchDraft(event.target.value)}
              maxLength={100}
              placeholder="Name or code"
              className="mt-1 h-10 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3"
            />
          </label>
          <label className="text-sm font-medium text-[var(--foreground)]">
            Type
            <select
              value={itemType}
              onChange={(event) => {
                setItemPage(1);
                setItemType(
                  inventoryItemTypes.find(
                    (type) => type === event.target.value,
                  ) ?? "",
                );
              }}
              className="mt-1 h-10 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3"
            >
              <option value="">All types</option>
              {inventoryItemTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-[var(--foreground)]">
            Sort by
            <select
              value={itemSortBy}
              onChange={(event) => {
                setItemPage(1);
                setItemSortBy(
                  (["createdAt", "name", "code"] as const).find(
                    (sortBy) => sortBy === event.target.value,
                  ) ?? "createdAt",
                );
              }}
              className="mt-1 h-10 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3"
            >
              <option value="createdAt">Created date</option>
              <option value="name">Name</option>
              <option value="code">Code</option>
            </select>
          </label>
          <label className="text-sm font-medium text-[var(--foreground)]">
            Order
            <select
              value={itemSortOrder}
              onChange={(event) => {
                setItemPage(1);
                setItemSortOrder(event.target.value === "asc" ? "asc" : "desc");
              }}
              className="mt-1 h-10 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3"
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </label>
          {canReadWarehouses ? (
            <WarehouseFilter
              warehouses={warehouses}
              value={itemWarehouseId}
              onChange={(value) => {
                setItemPage(1);
                setItemWarehouseId(value);
              }}
              isPending={warehousesQuery.isPending}
              isError={warehousesQuery.isError}
            />
          ) : null}
          <button
            type="submit"
            className="h-10 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-white"
          >
            Search
          </button>
        </form>
      </section>

      {!items.length ? (
        <>
          <EmptyState
            title={
              itemPagination?.total
                ? "No items on this page"
                : "No inventory items found"
            }
            description={
              itemSearch || itemType || itemWarehouseId
                ? "No inventory items match the selected search and filters."
                : "This tenant has no inventory records."
            }
          />
          {itemPage > 1 ? (
            <PaginationControls
              page={itemPagination?.page ?? itemPage}
              totalPages={itemPagination?.totalPages ?? 0}
              onPageChange={setItemPage}
            />
          ) : null}
        </>
      ) : (
        <section className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--panel)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--muted)] text-[var(--muted-foreground)]">
                <tr>
                  {["Item", "Code", "Type", "Unit", "Status"].map((heading) => (
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
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-t border-[var(--border)] transition-colors hover:bg-[var(--muted)]/50"
                  >
                    <td className="px-4 py-4">
                      <Link
                        href={`/app/inventory/${item.id}`}
                        className="font-semibold text-[var(--foreground)] hover:text-[var(--primary)]"
                      >
                        {item.name}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-[var(--muted-foreground)]">
                      {item.code}
                    </td>
                    <td className="px-4 py-4 font-medium text-[var(--foreground)]">
                      {item.type}
                    </td>
                    <td className="px-4 py-4 text-[var(--muted-foreground)]">
                      {item.unit ?? "—"}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge tone={statusTone(item)}>
                        {item.isActive ? "Active" : "Inactive"}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-4">
            <PaginationControls
              page={itemPagination?.page ?? itemPage}
              totalPages={itemPagination?.totalPages ?? 0}
              onPageChange={setItemPage}
            />
          </div>
        </section>
      )}

      <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5">
        <SectionHeader eyebrow="Movement history" title="Inventory activity" />
        <form
          className="mb-5 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setHistoryPage(1);
            setHistorySearch(historySearchDraft.trim());
          }}
        >
          <label className="text-sm font-medium text-[var(--foreground)]">
            Search
            <input
              value={historySearchDraft}
              onChange={(event) => setHistorySearchDraft(event.target.value)}
              maxLength={100}
              placeholder="Item, code, or note"
              className="mt-1 h-10 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3"
            />
          </label>
          <label className="text-sm font-medium text-[var(--foreground)]">
            Movement type
            <select
              value={historyType}
              onChange={(event) => {
                setHistoryPage(1);
                setHistoryType(
                  inventoryMovementTypes.find(
                    (type) => type === event.target.value,
                  ) ?? "",
                );
              }}
              className="mt-1 h-10 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3"
            >
              <option value="">All movement types</option>
              {inventoryMovementTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          {canReadWarehouses ? (
            <WarehouseFilter
              warehouses={warehouses}
              value={historyWarehouseId}
              onChange={(value) => {
                setHistoryPage(1);
                setHistoryWarehouseId(value);
              }}
              isPending={warehousesQuery.isPending}
              isError={warehousesQuery.isError}
            />
          ) : null}
          <label className="text-sm font-medium text-[var(--foreground)]">
            Sort by
            <select
              value={historySortBy}
              onChange={(event) => {
                setHistoryPage(1);
                setHistorySortBy(
                  (["createdAt", "quantity", "type"] as const).find(
                    (sortBy) => sortBy === event.target.value,
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
              value={historySortOrder}
              onChange={(event) => {
                setHistoryPage(1);
                setHistorySortOrder(
                  event.target.value === "asc" ? "asc" : "desc",
                );
              }}
              className="mt-1 h-10 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3"
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
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
          <>
            <EmptyState
              title={
                historyPagination?.total
                  ? "No movements on this page"
                  : "No movement history found"
              }
              description={
                historySearch || historyType || historyWarehouseId
                  ? "No movements match the selected search and filters."
                  : "This tenant has no inventory movement records."
              }
            />
            {historyPage > 1 ? (
              <PaginationControls
                page={historyPagination?.page ?? historyPage}
                totalPages={historyPagination?.totalPages ?? 0}
                onPageChange={setHistoryPage}
              />
            ) : null}
          </>
        ) : (
          <div className="space-y-3">
            {movements.map((movement) => (
              <div
                key={movement.id}
                className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-[var(--foreground)]">
                    {movement.InventoryItem?.name ?? movement.inventoryItemId}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {movement.type} · {movement.quantity} ·{" "}
                    {movement.Warehouse?.name ??
                      movement.warehouseId ??
                      "No warehouse"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {new Date(movement.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
            <PaginationControls
              page={historyPagination?.page ?? historyPage}
              totalPages={historyPagination?.totalPages ?? 0}
              onPageChange={setHistoryPage}
            />
          </div>
        )}
      </section>
    </div>
  );
}
