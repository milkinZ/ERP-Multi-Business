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
import {
  getWarehouse,
  getWarehouseStocks,
  warehouseKeys,
} from "@/features/erp/warehouses/api/queries";
import {
  getInventoryHistory,
  inventoryKeys,
  type InventoryHistoryQuery,
  type InventoryMovementType,
} from "@/features/erp/inventory/api/queries";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";

export default function WarehouseDetailPage() {
  const { warehouseId } = useParams<{ warehouseId: string }>();
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const tenantId = session?.tenantId;
  const canRead = hasPermission(session, "warehouse.read");
  const [stockPage, setStockPage] = useState(1);
  const [stockSearchDraft, setStockSearchDraft] = useState("");
  const [stockSearch, setStockSearch] = useState("");
  const canReadInventory = hasPermission(session, "inventory.read");
  const [movementPage, setMovementPage] = useState(1);
  const [movementSearchDraft, setMovementSearchDraft] = useState("");
  const [movementSearch, setMovementSearch] = useState("");
  const [movementType, setMovementType] = useState<InventoryMovementType | "">(
    "",
  );
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
  const movementQueryParams: InventoryHistoryQuery = {
    page: movementPage,
    limit: 20,
    warehouseId,
    ...(movementSearch ? { search: movementSearch } : {}),
    ...(movementType ? { type: movementType } : {}),
  };

  const query = useQuery({
    queryKey: tenantId
      ? warehouseKeys.detail(tenantId, warehouseId)
      : ["warehouses", "unauthenticated", warehouseId],
    queryFn: () => getWarehouse(token as string, warehouseId),
    enabled: Boolean(token && tenantId && canRead && warehouseId),
    staleTime: 60_000,
  });
  const stocksQuery = useQuery({
    queryKey:
      tenantId && warehouseId
        ? warehouseKeys.stocks(tenantId, warehouseId, stockPage, stockSearch)
        : ["warehouses", "unauthenticated", warehouseId, "stocks"],
    queryFn: () =>
      getWarehouseStocks(token as string, warehouseId, {
        page: stockPage,
        limit: 20,
        search: stockSearch || undefined,
      }),
    enabled: Boolean(token && tenantId && canRead && warehouseId),
    staleTime: 15_000,
  });
  const movementsQuery = useQuery({
    queryKey: tenantId
      ? inventoryKeys.history(tenantId, movementQueryParams)
      : ["inventory-history", "unauthenticated", warehouseId],
    queryFn: () => getInventoryHistory(token as string, movementQueryParams),
    enabled: Boolean(
      token && tenantId && canRead && canReadInventory && warehouseId,
    ),
    staleTime: 15_000,
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
      <div className="h-48 animate-pulse rounded-3xl border border-border bg-card" />
    );
  if (query.isError) {
    const message =
      query.error instanceof ApiError &&
      (query.error.status === 400 || query.error.status === 404)
        ? "This warehouse was not found in the current tenant."
        : "The Warehouse detail API could not be reached.";
    return (
      <UnavailableState
        title="Unable to load warehouse"
        description={message}
      />
    );
  }
  if (!query.data)
    return (
      <UnavailableState
        title="Warehouse not found"
        description="The API returned no warehouse record for this tenant-scoped route."
      />
    );

  const warehouse = query.data;
  const stocks = stocksQuery.data;
  const movements = movementsQuery.data;

  return (
    <>
      <PageHeader
        eyebrow="Tenant application / infrastructure"
        title={warehouse.name}
        description="Warehouse master data returned by the tenant-scoped backend API."
        actions={<StatusBadge tone="info">Stock location</StatusBadge>}
      />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Warehouse ID
          </p>
          <p className="mt-2 break-all font-medium">{warehouse.id}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Code
          </p>
          <p className="mt-2 font-medium">{warehouse.code}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Outlet
          </p>
          <p className="mt-2 break-all font-medium">
            {warehouse.outletId ?? "Tenant-wide"}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Created
          </p>
          <p className="mt-2 font-medium">
            {new Date(warehouse.createdAt).toLocaleDateString()}
          </p>
        </div>
      </section>
      <section className="mt-6 rounded-3xl border border-border bg-card p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Movement history
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Tenant-scoped inventory movements recorded at this warehouse.
          </p>
        </div>
        {!canReadInventory ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Movement history requires the inventory.read permission.
          </p>
        ) : movementsQuery.isPending ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Loading warehouse movement history...
          </p>
        ) : movementsQuery.isError ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            Unable to load tenant-scoped warehouse movement history.
          </p>
        ) : (
          <>
            <form
              className="mt-4 flex flex-wrap items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                setMovementPage(1);
                setMovementSearch(movementSearchDraft.trim());
              }}
            >
              <label className="text-sm font-medium">
                Search
                <input
                  value={movementSearchDraft}
                  onChange={(event) =>
                    setMovementSearchDraft(event.target.value)
                  }
                  maxLength={100}
                  placeholder="Item, code, or note"
                  className="mt-1 h-10 rounded-xl border border-border bg-card px-3"
                />
              </label>
              <label className="text-sm font-medium">
                Movement type
                <select
                  value={movementType}
                  onChange={(event) => {
                    setMovementPage(1);
                    setMovementType(
                      movementTypes.find(
                        (type) => type === event.target.value,
                      ) ?? "",
                    );
                  }}
                  className="mt-1 h-10 rounded-xl border border-border bg-card px-3"
                >
                  <option value="">All movement types</option>
                  {movementTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-white"
              >
                Search
              </button>
            </form>
            {!movements?.data.length ? (
              <p className="mt-4 text-sm text-muted-foreground">
                No movement history was returned for this warehouse.
              </p>
            ) : (
              <>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-muted text-muted-foreground">
                      <tr>
                        {[
                          "Date",
                          "Item",
                          "Type",
                          "Quantity",
                          "Balance",
                          "Note",
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
                      {movements.data.map((movement) => (
                        <tr
                          key={movement.id}
                          className="border-t border-border"
                        >
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {new Date(movement.createdAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-medium">
                              {movement.InventoryItem?.name ?? "Unknown item"}
                            </span>
                            <span className="ml-2 text-muted-foreground">
                              {movement.InventoryItem?.code ?? ""}
                            </span>
                          </td>
                          <td className="px-4 py-3">{movement.type}</td>
                          <td className="px-4 py-3">{movement.quantity}</td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {movement.beforeQuantity ?? "-"} →{" "}
                            {movement.afterQuantity ?? "-"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {movement.note ?? "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">
                    {movements.pagination.total} movement
                    {movements.pagination.total === 1 ? "" : "s"} · Page{" "}
                    {movements.pagination.page} of{" "}
                    {Math.max(movements.pagination.totalPages, 1)}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={movementPage <= 1 || movementsQuery.isFetching}
                      onClick={() => setMovementPage((page) => page - 1)}
                      className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={
                        movementPage >= movements.pagination.totalPages ||
                        movementsQuery.isFetching
                      }
                      onClick={() => setMovementPage((page) => page + 1)}
                      className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </section>
      <section className="mt-6 rounded-3xl border border-border bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Inventory stock
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              On-hand quantity by item and unit. Quantities in different units
              are not summed together.
            </p>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setStockPage(1);
              setStockSearch(stockSearchDraft.trim());
            }}
            className="flex gap-2"
          >
            <label className="sr-only" htmlFor="warehouse-stock-search">
              Search inventory items
            </label>
            <input
              id="warehouse-stock-search"
              value={stockSearchDraft}
              onChange={(event) => setStockSearchDraft(event.target.value)}
              maxLength={100}
              placeholder="Search item or code"
              className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
            />
            <button
              type="submit"
              className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-white"
            >
              Search
            </button>
          </form>
        </div>
        {stocksQuery.isPending ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Loading warehouse stock...
          </p>
        ) : stocksQuery.isError ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            Unable to load the tenant-scoped warehouse stock.
          </p>
        ) : !stocks?.data.length ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {stockSearch
              ? "No inventory items match this search."
              : "No stock records are associated with this warehouse."}
          </p>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    {["Item", "Code", "Type", "On hand", "Unit", "Updated"].map(
                      (heading) => (
                        <th
                          key={heading}
                          className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em]"
                        >
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {stocks.data.map((stock) => (
                    <tr
                      key={stock.inventoryItemId}
                      className="border-t border-border"
                    >
                      <td className="px-4 py-3 font-medium">{stock.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {stock.code}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {stock.type}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {stock.quantity}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {stock.unit ?? "-"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(stock.updatedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">
                {stocks.pagination.total} item
                {stocks.pagination.total === 1 ? "" : "s"} · Page{" "}
                {stocks.pagination.page} of{" "}
                {Math.max(stocks.pagination.totalPages, 1)}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={stockPage <= 1 || stocksQuery.isFetching}
                  onClick={() => setStockPage((page) => page - 1)}
                  className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={
                    stockPage >= stocks.pagination.totalPages ||
                    stocksQuery.isFetching
                  }
                  onClick={() => setStockPage((page) => page + 1)}
                  className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>
      <section className="mt-6 rounded-3xl border border-border bg-card p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Unavailable operations
        </p>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Warehouse updates are available to users with warehouse.update from
          the Warehouse master-data list. Delete, deactivate, valuation, and
          warehouse analytics are not exposed. Inventory transfer workflows are
          available in the Inventory workspace.
        </p>
      </section>
      <Link
        href="/app/warehouses"
        className="mt-6 inline-flex text-sm font-semibold text-primary hover:underline"
      >
        Back to warehouses
      </Link>
    </>
  );
}
