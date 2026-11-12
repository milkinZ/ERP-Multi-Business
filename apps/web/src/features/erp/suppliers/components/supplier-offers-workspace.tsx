"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getAllInventoryItems } from "@/features/erp/inventory/api/queries";
import {
  closeSupplierOffer,
  createSupplierOffer,
  getSupplierOffers,
  supplierKeys,
  type Supplier,
} from "@/features/erp/suppliers/api/queries";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/stores/auth.store";

function localDateTimeValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function displayDate(value: string) {
  return new Date(value).toLocaleString();
}

function displayPrice(amount: string | number, currencyCode: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 6,
  }).format(Number(amount));
}

export function SupplierOffersWorkspace({
  supplier,
  canReadInventory,
  canUpdateSupplier,
}: {
  supplier: Supplier;
  canReadInventory: boolean;
  canUpdateSupplier: boolean;
}) {
  const token = useAuthStore((state) => state.accessToken);
  const tenantId = useAuthStore((state) => state.session?.tenantId);
  const queryClient = useQueryClient();
  const [skip, setSkip] = useState(0);
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [supplierSku, setSupplierSku] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [minimumOrderQuantity, setMinimumOrderQuantity] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(localDateTimeValue);
  const [effectiveTo, setEffectiveTo] = useState("");
  const [closingOfferId, setClosingOfferId] = useState("");
  const [closingAt, setClosingAt] = useState(localDateTimeValue);
  const [serverError, setServerError] = useState<string | null>(null);

  const offersQuery = useQuery({
    queryKey: tenantId
      ? supplierKeys.offers(tenantId, supplier.id, skip)
      : ["suppliers", "unauthenticated", supplier.id, "offers", skip],
    queryFn: () =>
      getSupplierOffers(token as string, supplier.id, { skip, take: 20 }),
    enabled: Boolean(token && tenantId && canReadInventory),
  });
  const itemsQuery = useQuery({
    queryKey: tenantId
      ? ["inventory-items", tenantId, "supplier-offer-options"]
      : ["inventory-items", "unauthenticated"],
    queryFn: () => getAllInventoryItems(token as string),
    enabled: Boolean(
      token && tenantId && canReadInventory && canUpdateSupplier,
    ),
    staleTime: 60_000,
  });
  const selectedItem = useMemo(
    () => itemsQuery.data?.find((item) => item.id === inventoryItemId),
    [inventoryItemId, itemsQuery.data],
  );
  const invalidateOffers = async () => {
    if (!tenantId) return;
    await queryClient.invalidateQueries({
      queryKey: ["suppliers", tenantId, supplier.id, "offers"],
    });
    await queryClient.invalidateQueries({
      queryKey: supplierKeys.detail(tenantId, supplier.id),
    });
  };
  const createMutation = useMutation({
    mutationFn: () => {
      if (!token) throw new Error("Authentication required");
      if (!selectedItem?.unit) {
        throw new Error("The selected inventory item must have a base unit");
      }
      return createSupplierOffer(token, supplier.id, {
        inventoryItemId,
        supplierSku: supplierSku.trim() || undefined,
        unit: selectedItem.unit,
        unitPrice: Number(unitPrice),
        minimumOrderQuantity:
          minimumOrderQuantity === ""
            ? undefined
            : Number(minimumOrderQuantity),
        leadTimeDays: leadTimeDays === "" ? undefined : Number(leadTimeDays),
        effectiveFrom: new Date(effectiveFrom).toISOString(),
        effectiveTo: effectiveTo
          ? new Date(effectiveTo).toISOString()
          : undefined,
      });
    },
    retry: 0,
    onSuccess: async () => {
      await invalidateOffers();
      setSupplierSku("");
      setUnitPrice("");
      setMinimumOrderQuantity("");
      setLeadTimeDays("");
      setEffectiveFrom(localDateTimeValue());
      setEffectiveTo("");
      setServerError(null);
    },
    onError: (cause) => {
      setServerError(
        cause instanceof ApiError && cause.status === 409
          ? "This supplier already has an offer for this item during an overlapping effective period."
          : cause instanceof ApiError && cause.status === 400
            ? cause.message
            : cause instanceof Error
              ? cause.message
              : "Unable to save supplier offer",
      );
    },
  });
  const closeMutation = useMutation({
    mutationFn: () => {
      if (!token) throw new Error("Authentication required");
      return closeSupplierOffer(
        token,
        supplier.id,
        closingOfferId,
        new Date(closingAt).toISOString(),
      );
    },
    retry: 0,
    onSuccess: async () => {
      await invalidateOffers();
      setClosingOfferId("");
      setServerError(null);
    },
    onError: (cause) => {
      setServerError(
        cause instanceof Error
          ? cause.message
          : "Unable to close supplier offer",
      );
    },
  });

  return (
    <section className="mt-6 space-y-4 rounded-3xl border border-border bg-card p-5">
      <div>
        <h2 className="text-lg font-semibold">Supplier item offers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Effective-dated prices are saved in the tenant base currency and use
          the inventory item base unit. Historical offers remain available.
        </p>
      </div>
      {!canReadInventory ? (
        <p className="text-sm text-muted-foreground">
          Supplier offers require the inventory.read permission because they
          reference tenant inventory items.
        </p>
      ) : (
        <>
          {serverError ? (
            <p role="alert" className="text-sm text-destructive">
              {serverError}
            </p>
          ) : null}
          {canUpdateSupplier ? (
            <form
              className="grid gap-3 rounded-2xl border border-border p-4 md:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                createMutation.mutate();
              }}
            >
              <label className="text-sm font-medium">
                Inventory item
                <select
                  required
                  value={inventoryItemId}
                  onChange={(event) => setInventoryItemId(event.target.value)}
                  className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3"
                >
                  <option value="">Select item</option>
                  {itemsQuery.data
                    ?.filter((item) => item.isActive && item.unit)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.code}) · {item.unit}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                Supplier SKU
                <input
                  value={supplierSku}
                  maxLength={100}
                  onChange={(event) => setSupplierSku(event.target.value)}
                  className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3"
                />
              </label>
              <label className="text-sm font-medium">
                Unit price (tenant base currency)
                <input
                  required
                  type="number"
                  min="0"
                  step="0.000001"
                  value={unitPrice}
                  onChange={(event) => setUnitPrice(event.target.value)}
                  className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3"
                />
              </label>
              <label className="text-sm font-medium">
                Minimum order quantity ({selectedItem?.unit ?? "item unit"})
                <input
                  type="number"
                  min="0"
                  step="0.000001"
                  value={minimumOrderQuantity}
                  onChange={(event) =>
                    setMinimumOrderQuantity(event.target.value)
                  }
                  className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3"
                />
              </label>
              <label className="text-sm font-medium">
                Lead time (days)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={leadTimeDays}
                  onChange={(event) => setLeadTimeDays(event.target.value)}
                  className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3"
                />
              </label>
              <label className="text-sm font-medium">
                Effective from
                <input
                  required
                  type="datetime-local"
                  value={effectiveFrom}
                  onChange={(event) => setEffectiveFrom(event.target.value)}
                  className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3"
                />
              </label>
              <label className="text-sm font-medium">
                Effective to (exclusive, optional)
                <input
                  type="datetime-local"
                  value={effectiveTo}
                  onChange={(event) => setEffectiveTo(event.target.value)}
                  className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3"
                />
              </label>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={
                    createMutation.isPending ||
                    !supplier.isActive ||
                    !itemsQuery.data?.length
                  }
                  className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {createMutation.isPending ? "Saving offer..." : "Add offer"}
                </button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Editing offers requires supplier.update.
            </p>
          )}
          {offersQuery.isPending ? (
            <p className="text-sm text-muted-foreground">
              Loading supplier offers...
            </p>
          ) : offersQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Unable to load supplier offers.
            </p>
          ) : !offersQuery.data?.data.length ? (
            <p className="text-sm text-muted-foreground">
              No supplier offers have been recorded.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-muted text-muted-foreground">
                    <tr>
                      {[
                        "Item",
                        "Supplier SKU",
                        "Price",
                        "Minimum",
                        "Lead time",
                        "Effective period",
                        "Action",
                      ].map((heading) => (
                        <th key={heading} className="px-3 py-2 text-xs">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {offersQuery.data.data.map((offer) => (
                      <tr key={offer.id} className="border-t border-border">
                        <td className="px-3 py-3">
                          {offer.InventoryItem.name} ({offer.InventoryItem.code}
                          )
                          <span className="block text-xs text-muted-foreground">
                            {offer.unit}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {offer.supplierSku ?? "-"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {displayPrice(offer.unitPrice, offer.currencyCode)}
                        </td>
                        <td className="px-3 py-3">
                          {offer.minimumOrderQuantity ?? "-"}
                        </td>
                        <td className="px-3 py-3">
                          {offer.leadTimeDays === null
                            ? "-"
                            : `${offer.leadTimeDays} days`}
                        </td>
                        <td className="px-3 py-3">
                          {displayDate(offer.effectiveFrom)}
                          <span className="block text-xs text-muted-foreground">
                            {offer.effectiveTo
                              ? `until ${displayDate(offer.effectiveTo)}`
                              : "open-ended"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {!offer.effectiveTo && canUpdateSupplier ? (
                            closingOfferId === offer.id ? (
                              <div className="space-y-2">
                                <input
                                  aria-label="Offer end date"
                                  type="datetime-local"
                                  value={closingAt}
                                  min={offer.effectiveFrom.slice(0, 16)}
                                  onChange={(event) =>
                                    setClosingAt(event.target.value)
                                  }
                                  className="h-9 rounded-lg border border-border bg-background px-2"
                                />
                                <button
                                  type="button"
                                  disabled={closeMutation.isPending}
                                  onClick={() => closeMutation.mutate()}
                                  className="rounded-lg border border-border px-2 py-1 text-xs"
                                >
                                  End offer
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setClosingOfferId(offer.id);
                                  setClosingAt(localDateTimeValue());
                                }}
                                className="text-xs font-semibold text-primary"
                              >
                                Set end date
                              </button>
                            )
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {offersQuery.data.pagination.total} offers
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={skip === 0 || offersQuery.isFetching}
                    onClick={() =>
                      setSkip((current) => Math.max(0, current - 20))
                    }
                    className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={
                      !offersQuery.data.pagination.hasMore ||
                      offersQuery.isFetching
                    }
                    onClick={() => setSkip((current) => current + 20)}
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
  );
}
