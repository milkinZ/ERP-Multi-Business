"use client";

import React, { useEffect, useRef, useState } from "react";
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
import {
  deletePurchaseOrder,
  getPurchaseOrder,
  getPurchaseOrderReceipts,
  purchaseOrderKeys,
  receivePurchaseOrder,
  updatePurchaseOrderStatus,
  type PurchaseOrderStatus,
  type ReceivePurchaseOrderInput,
} from "@/features/erp/purchase-orders/api/queries";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";

const nextStatuses: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  DRAFT: ["PENDING", "CANCELLED"],
  PENDING: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["CANCELLED"],
  PARTIALLY_RECEIVED: ["CANCELLED"],
  RECEIVED: ["COMPLETED"],
  REJECTED: ["CANCELLED"],
  CANCELLED: [],
  COMPLETED: [],
};
function statusTone(status: PurchaseOrderStatus) {
  if (status === "COMPLETED" || status === "RECEIVED")
    return "success" as const;
  if (status === "CANCELLED" || status === "REJECTED") return "danger" as const;
  if (status === "APPROVED" || status === "PARTIALLY_RECEIVED")
    return "info" as const;
  return "warning" as const;
}

type PendingReceiptSubmission = {
  key: string;
  payload: string;
  input: ReceivePurchaseOrderInput;
};

function receiptRequestPayload(input: ReceivePurchaseOrderInput) {
  const items = [...input.items].sort((left, right) =>
    left.purchaseOrderItemId.localeCompare(right.purchaseOrderItemId),
  );
  return JSON.stringify({ items, note: input.note?.trim() || null });
}

function isReceiptRequestItem(
  value: unknown,
): value is ReceivePurchaseOrderInput["items"][number] {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.purchaseOrderItemId === "string" &&
    typeof item.receivedQuantity === "number" &&
    Number.isFinite(item.receivedQuantity) &&
    item.receivedQuantity >= 0.1
  );
}

function isReceivePurchaseOrderInput(
  value: unknown,
): value is ReceivePurchaseOrderInput {
  if (typeof value !== "object" || value === null) return false;
  const input = value as Record<string, unknown>;
  return (
    Array.isArray(input.items) &&
    input.items.length > 0 &&
    input.items.every(isReceiptRequestItem) &&
    (input.note === undefined ||
      (typeof input.note === "string" && input.note.length <= 500))
  );
}

function isPendingReceiptSubmission(
  value: unknown,
): value is PendingReceiptSubmission {
  if (typeof value !== "object" || value === null) return false;
  const pending = value as Record<string, unknown>;
  return (
    typeof pending.key === "string" &&
    typeof pending.payload === "string" &&
    isReceivePurchaseOrderInput(pending.input) &&
    pending.payload === receiptRequestPayload(pending.input)
  );
}

export default function PurchaseOrderDetailPage() {
  const { purchaseOrderId } = useParams<{ purchaseOrderId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const tenantId = session?.tenantId;
  const canRead = hasPermission(session, "purchase_order.read");
  const canUpdate = hasPermission(session, "purchase_order.update");
  const canDelete = hasPermission(session, "purchase_order.delete");
  const canReceive = hasPermission(session, "purchase_order.receive");
  const canTransition =
    hasPermission(session, "purchase_order.approve") &&
    hasPermission(session, "purchase_order.receive");
  const [isEditing, setIsEditing] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [unknownResult, setUnknownResult] = useState(false);
  const [receiptQuantities, setReceiptQuantities] = useState<
    Record<string, string>
  >({});
  const [receiptPage, setReceiptPage] = useState(1);
  const receiptPageSize = 10;
  useEffect(() => {
    setReceiptPage(1);
  }, [purchaseOrderId]);
  const [receiptNote, setReceiptNote] = useState("");
  const [receiptStorageError, setReceiptStorageError] = useState<string | null>(
    null,
  );
  const pendingReceiptKey = useRef<PendingReceiptSubmission | null>(null);

  const query = useQuery({
    queryKey: tenantId
      ? purchaseOrderKeys.detail(tenantId, purchaseOrderId)
      : ["purchase-orders", "unauthenticated", purchaseOrderId],
    queryFn: () => getPurchaseOrder(token as string, purchaseOrderId),
    enabled: Boolean(token && tenantId && canRead && purchaseOrderId),
    staleTime: 30_000,
  });
  const receiptsQuery = useQuery({
    queryKey: tenantId
      ? purchaseOrderKeys.receipts(
          tenantId,
          purchaseOrderId,
          (receiptPage - 1) * receiptPageSize,
          receiptPageSize,
        )
      : ["purchase-orders", "unauthenticated", purchaseOrderId, "receipts"],
    queryFn: () =>
      getPurchaseOrderReceipts(
        token as string,
        purchaseOrderId,
        (receiptPage - 1) * receiptPageSize,
        receiptPageSize,
      ),
    enabled: Boolean(token && tenantId && canRead && purchaseOrderId),
    staleTime: 30_000,
  });
  const suppliersQuery = useQuery({
    queryKey: tenantId
      ? supplierKeys.options(tenantId)
      : ["suppliers", "unauthenticated"],
    queryFn: () => getSuppliers(token as string),
    enabled: Boolean(token && tenantId && canRead && canUpdate),
    staleTime: 60_000,
  });
  const warehousesQuery = useQuery({
    queryKey: tenantId
      ? warehouseKeys.all(tenantId)
      : ["warehouses", "unauthenticated"],
    queryFn: () => getWarehouses(token as string),
    enabled: Boolean(token && tenantId && canRead && canUpdate),
    staleTime: 60_000,
  });
  const inventoryQuery = useQuery({
    queryKey: tenantId
      ? inventoryKeys.all(tenantId)
      : ["inventory", "unauthenticated"],
    queryFn: () => getAllInventoryItems(token as string),
    enabled: Boolean(token && tenantId && canRead && canUpdate),
    staleTime: 15_000,
  });
  const pendingReceiptStorageKey = tenantId
    ? `purchase-order:${tenantId}:${purchaseOrderId}:pending-receipt`
    : null;

  useEffect(() => {
    if (!pendingReceiptStorageKey || !query.data) return;
    let saved: string | null;
    try {
      saved = window.sessionStorage.getItem(pendingReceiptStorageKey);
    } catch {
      setReceiptStorageError(
        "Browser storage is unavailable. Verify receipt history before submitting a receipt.",
      );
      return;
    }
    if (!saved) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(saved);
    } catch {
      setReceiptStorageError(
        "Saved receipt retry data is invalid. Verify receipt history before submitting another receipt.",
      );
      return;
    }
    if (!isPendingReceiptSubmission(parsed)) {
      setReceiptStorageError(
        "Saved receipt retry data is invalid. Verify receipt history before submitting another receipt.",
      );
      return;
    }

    pendingReceiptKey.current = parsed;
    setReceiptQuantities(
      Object.fromEntries(
        parsed.input.items.map((item) => [
          item.purchaseOrderItemId,
          String(item.receivedQuantity),
        ]),
      ),
    );
    setReceiptNote(parsed.input.note ?? "");
    setMutationError(
      "A previous receipt request may still be pending. Retry without changing the quantities to reuse its idempotency key, or verify receipt history first.",
    );
    setUnknownResult(true);
  }, [pendingReceiptStorageKey, query.data]);

  const invalidate = async (inventoryChanged = false) => {
    if (!tenantId) return;
    await queryClient.invalidateQueries({
      queryKey: purchaseOrderKeys.all(tenantId),
    });
    await queryClient.invalidateQueries({
      queryKey: purchaseOrderKeys.detail(tenantId, purchaseOrderId),
    });
    if (inventoryChanged) {
      await queryClient.invalidateQueries({
        queryKey: inventoryKeys.list(tenantId),
      });
      await queryClient.invalidateQueries({
        queryKey: inventoryKeys.all(tenantId),
      });
      await queryClient.invalidateQueries({
        queryKey: inventoryKeys.history(tenantId),
      });
      await queryClient.invalidateQueries({
        queryKey: inventoryKeys.stockBalancesForTenant(tenantId),
      });
    }
  };
  const statusMutation = useMutation({
    mutationFn: (status: PurchaseOrderStatus) => {
      if (!token) throw new Error("Authentication required");
      return updatePurchaseOrderStatus(token, purchaseOrderId, status);
    },
    retry: 0,
    onSuccess: async (_, status) => {
      await invalidate(
        ["PARTIALLY_RECEIVED", "RECEIVED", "COMPLETED"].includes(status),
      );
      setMutationError(null);
      setUnknownResult(false);
    },
    onError: (cause) => {
      if (!(cause instanceof ApiError)) {
        setUnknownResult(true);
        setMutationError(
          "The status request may have been processed. Verify the Purchase Order and Inventory state before trying again.",
        );
        return;
      }
      setMutationError(
        cause.status === 403
          ? "You do not have permission to change this Purchase Order status."
          : cause.message,
      );
      setUnknownResult(false);
    },
  });
  const receiptMutation = useMutation({
    mutationFn: ({
      key,
      input,
    }: {
      key: string;
      input: ReceivePurchaseOrderInput;
    }) => {
      if (!token) throw new Error("Authentication required");
      return receivePurchaseOrder(token, purchaseOrderId, key, input);
    },
    retry: 0,
    onSuccess: async () => {
      if (pendingReceiptStorageKey) {
        try {
          window.sessionStorage.removeItem(pendingReceiptStorageKey);
        } catch {
          setReceiptStorageError(
            "Receipt was recorded, but retry data could not be cleared. Verify receipt history before recording another receipt.",
          );
        }
      }
      pendingReceiptKey.current = null;
      setReceiptQuantities({});
      setReceiptNote("");
      await invalidate(true);
      if (tenantId)
        await queryClient.invalidateQueries({
          queryKey: purchaseOrderKeys.receipts(tenantId, purchaseOrderId),
        });
      setMutationError(null);
      setUnknownResult(false);
    },
    onError: (cause) => {
      if (!(cause instanceof ApiError)) {
        setUnknownResult(true);
        setMutationError(
          "The receipt may have been processed. Retry without changing the quantities to reuse the same idempotency key, or refresh the Purchase Order.",
        );
        return;
      }
      setMutationError(
        cause.status === 403
          ? "You do not have permission to receive this Purchase Order."
          : cause.message,
      );
      setUnknownResult(false);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!token) throw new Error("Authentication required");
      return deletePurchaseOrder(token, purchaseOrderId);
    },
    retry: 0,
    onSuccess: async () => {
      await invalidate();
      router.push("/app/purchase-orders");
    },
    onError: (cause) =>
      setMutationError(
        cause instanceof Error
          ? cause.message
          : "Unable to delete Purchase Order",
      ),
  });

  if (!canRead)
    return (
      <UnavailableState
        title="Purchase Order access is restricted"
        description="Your current tenant session does not include the purchase_order.read permission."
      />
    );
  if (query.isPending)
    return <div className="h-56 animate-pulse rounded-3xl bg-muted" />;
  if (query.isError)
    return (
      <UnavailableState
        title="Unable to load Purchase Order"
        description={
          query.error instanceof ApiError &&
          (query.error.status === 400 || query.error.status === 404)
            ? "This Purchase Order was not found in the current tenant."
            : "The Purchase Order detail API could not be reached."
        }
      />
    );
  if (!query.data)
    return (
      <UnavailableState
        title="Purchase Order not found"
        description="The API returned no Purchase Order for this tenant-scoped route."
      />
    );
  const order = query.data;
  const suppliers = suppliersQuery.data ?? [];
  const warehouses = warehousesQuery.data ?? [];
  const inventoryItems = inventoryQuery.data ?? [];
  const canEdit =
    canUpdate && (order.status === "DRAFT" || order.status === "PENDING");
  const canReceiveNow =
    canReceive &&
    (order.status === "APPROVED" || order.status === "PARTIALLY_RECEIVED");

  const submitReceipt = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (receiptStorageError) return;
    const requestedItems = order.PurchaseOrderItem.filter((item) =>
      receiptQuantities[item.id]?.trim(),
    ).map((item) => ({
      purchaseOrderItemId: item.id,
      receivedQuantity: Number(receiptQuantities[item.id]),
    }));

    if (
      !requestedItems.length ||
      requestedItems.some(
        (item) =>
          !Number.isFinite(item.receivedQuantity) ||
          item.receivedQuantity < 0.1,
      )
    ) {
      setUnknownResult(false);
      setMutationError(
        "Enter a received quantity of at least 0.1 for one or more items.",
      );
      return;
    }

    const input: ReceivePurchaseOrderInput = {
      items: requestedItems,
      ...(receiptNote.trim() ? { note: receiptNote.trim() } : {}),
    };
    const payload = receiptRequestPayload(input);
    const key =
      pendingReceiptKey.current?.payload === payload
        ? pendingReceiptKey.current.key
        : crypto.randomUUID();
    const pendingSubmission = { payload, key, input };
    if (!pendingReceiptStorageKey) {
      setReceiptStorageError(
        "The Purchase Order tenant context is unavailable. The receipt request was not sent.",
      );
      return;
    }
    try {
      window.sessionStorage.setItem(
        pendingReceiptStorageKey,
        JSON.stringify(pendingSubmission),
      );
    } catch {
      setReceiptStorageError(
        "Unable to save receipt retry data in this browser. The receipt request was not sent.",
      );
      return;
    }
    pendingReceiptKey.current = pendingSubmission;
    setMutationError(null);
    setUnknownResult(false);
    receiptMutation.mutate({ key, input });
  };

  return (
    <>
      <PageHeader
        eyebrow="Tenant application / procurement"
        title={order.poNumber}
        description="Purchase Order detail and lifecycle state returned by the transactional backend API."
        actions={
          <StatusBadge tone={statusTone(order.status)}>
            {order.status}
          </StatusBadge>
        }
      />
      {mutationError ? (
        <p
          role="alert"
          className={`mb-6 rounded-xl border px-4 py-3 text-sm ${unknownResult ? "border-warning/30 bg-warning/10 text-warning" : "border-destructive/30 bg-destructive/10 text-destructive"}`}
        >
          {mutationError}
        </p>
      ) : null}
      {receiptStorageError ? (
        <p
          role="alert"
          className="mb-6 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
        >
          {receiptStorageError}
        </p>
      ) : null}
      {isEditing && canEdit ? (
        <section className="rounded-3xl border border-border bg-card p-5">
          <SectionHeader
            eyebrow="Transaction action"
            title="Edit Purchase Order"
          />
          {suppliersQuery.isPending ||
          warehousesQuery.isPending ||
          inventoryQuery.isPending ? (
            <div className="h-32 animate-pulse rounded-2xl bg-muted" />
          ) : (
            <PurchaseOrderForm
              purchaseOrder={order}
              suppliers={suppliers}
              warehouses={warehouses}
              inventoryItems={inventoryItems}
              onSaved={() => {
                setIsEditing(false);
                query.refetch();
              }}
            />
          )}
        </section>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Supplier
              </p>
              <p className="mt-2 font-medium">
                {order.Supplier?.name ?? order.supplierId}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Warehouse
              </p>
              <p className="mt-2 font-medium">
                {order.Warehouse?.name ?? order.warehouseId ?? "-"}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Total
              </p>
              <p className="mt-2 text-2xl font-semibold">{order.totalAmount}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Created
              </p>
              <p className="mt-2 font-medium">
                {new Date(order.createdAt).toLocaleDateString()}
              </p>
            </div>
          </section>
          <section className="mt-6 rounded-3xl border border-border bg-card p-5">
            <SectionHeader eyebrow="Ordered items" title="Line items" />
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    {[
                      "Inventory item",
                      "Ordered",
                      "Received",
                      "Unit price",
                      "Subtotal",
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
                  {order.PurchaseOrderItem.map((item) => (
                    <tr key={item.id} className="border-t border-border">
                      <td className="px-4 py-4 font-medium text-foreground">
                        {item.InventoryItem?.name ?? item.inventoryItemId}
                        <p className="text-xs text-muted-foreground">
                          {item.InventoryItem?.code ?? ""}
                        </p>
                      </td>
                      <td className="px-4 py-4">{item.quantity}</td>
                      <td className="px-4 py-4">{item.receivedQuantity}</td>
                      <td className="px-4 py-4">{item.unitPrice}</td>
                      <td className="px-4 py-4">{item.subtotal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Received quantities and totals are backend-authoritative.
            </p>
          </section>
          {canReceiveNow ? (
            <section className="mt-6 rounded-3xl border border-border bg-card p-5">
              <SectionHeader
                eyebrow="Inventory receipt"
                title="Receive items"
              />
              <p className="mb-4 text-sm text-muted-foreground">
                Enter quantities received in this delivery. Values are
                incremental, and quantities above the remaining order amount are
                rejected.
              </p>
              <form onSubmit={submitReceipt} className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-muted text-muted-foreground">
                      <tr>
                        {["Inventory item", "Remaining", "Received now"].map(
                          (heading) => (
                            <th
                              key={heading}
                              className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em]"
                            >
                              {heading}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {order.PurchaseOrderItem.map((item) => {
                        const remaining = Math.max(
                          0,
                          item.quantity - item.receivedQuantity,
                        );
                        return (
                          <tr key={item.id} className="border-t border-border">
                            <td className="px-4 py-3 font-medium">
                              {item.InventoryItem?.name ?? item.inventoryItemId}
                            </td>
                            <td className="px-4 py-3">
                              {remaining} {item.InventoryItem?.unit ?? ""}
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                min="0.1"
                                max={remaining}
                                step="any"
                                value={receiptQuantities[item.id] ?? ""}
                                disabled={
                                  remaining <= 0 ||
                                  receiptMutation.isPending ||
                                  Boolean(receiptStorageError)
                                }
                                onChange={(change) =>
                                  setReceiptQuantities((current) => ({
                                    ...current,
                                    [item.id]: change.target.value,
                                  }))
                                }
                                className="h-10 w-36 rounded-lg border border-border bg-background px-3"
                                aria-label={`Quantity received for ${item.InventoryItem?.name ?? item.inventoryItemId}`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <label className="block text-sm font-medium">
                  Receipt note (optional)
                  <input
                    value={receiptNote}
                    maxLength={500}
                    disabled={Boolean(receiptStorageError)}
                    onChange={(change) => setReceiptNote(change.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3"
                  />
                </label>
                <button
                  type="submit"
                  disabled={
                    receiptMutation.isPending || Boolean(receiptStorageError)
                  }
                  className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {receiptMutation.isPending
                    ? "Recording receipt..."
                    : "Record receipt"}
                </button>
              </form>
            </section>
          ) : null}
          <section className="mt-6 rounded-3xl border border-border bg-card p-5">
            <SectionHeader
              eyebrow="Receipt audit trail"
              title="Receipt history"
            />
            {receiptsQuery.isPending ? (
              <p className="text-sm text-muted-foreground">
                Loading receipt history...
              </p>
            ) : receiptsQuery.isError ? (
              <p role="alert" className="text-sm text-destructive">
                Unable to load the receipt history.
              </p>
            ) : !receiptsQuery.data?.data.length ? (
              <p className="text-sm text-muted-foreground">
                No receipts have been recorded.
              </p>
            ) : (
              <div className="space-y-4">
                {receiptsQuery.data.data.map((receipt) => (
                  <article
                    key={receipt.id}
                    className="rounded-xl border border-border p-4"
                  >
                    <div className="flex flex-wrap justify-between gap-2 text-sm">
                      <span className="font-semibold">
                        {receipt.statusAfter.replaceAll("_", " ")}
                      </span>
                      <time
                        dateTime={receipt.createdAt}
                        className="text-muted-foreground"
                      >
                        {new Date(receipt.createdAt).toLocaleString()}
                      </time>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Recorded by{" "}
                      {receipt.User?.email ?? receipt.createdById ?? "unknown"}
                      {receipt.note ? ` · ${receipt.note}` : ""}
                    </p>
                    <ul className="mt-3 space-y-1 text-sm">
                      {receipt.Items.map((item) => (
                        <li key={item.id}>
                          {item.InventoryItem?.name ?? item.inventoryItemId}: +
                          {item.receivedQuantity}{" "}
                          {item.InventoryItem?.unit ?? ""}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">
                    {receiptsQuery.data.pagination.total} receipt
                    {receiptsQuery.data.pagination.total === 1 ? "" : "s"} ·
                    Page {receiptPage} of{" "}
                    {Math.max(receiptsQuery.data.pagination.pages, 1)}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={receiptPage <= 1 || receiptsQuery.isFetching}
                      onClick={() => setReceiptPage((value) => value - 1)}
                      className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={
                        receiptPage >= receiptsQuery.data.pagination.pages ||
                        receiptsQuery.isFetching
                      }
                      onClick={() => setReceiptPage((value) => value + 1)}
                      className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
          <section className="mt-6 rounded-3xl border border-border bg-card p-5">
            <SectionHeader
              eyebrow="Lifecycle"
              title="Available status actions"
            />
            {canTransition && nextStatuses[order.status].length ? (
              <div className="flex flex-wrap gap-2">
                {nextStatuses[order.status].map((nextStatus) => (
                  <button
                    key={nextStatus}
                    type="button"
                    disabled={statusMutation.isPending}
                    onClick={() => {
                      setMutationError(null);
                      setUnknownResult(false);
                      statusMutation.mutate(nextStatus);
                    }}
                    className="rounded-xl border border-border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    {statusMutation.isPending
                      ? "Submitting..."
                      : `Move to ${nextStatus}`}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No lifecycle action is available for this status or permission
                set.
              </p>
            )}
            <p className="mt-4 text-sm text-muted-foreground">
              Inventory stock changes are made only by the backend receipt
              transaction.
            </p>
          </section>
          <div className="mt-6 flex flex-wrap gap-3">
            {canEdit ? (
              <button
                type="button"
                onClick={() => {
                  setIsEditing(true);
                  setMutationError(null);
                }}
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
              >
                Edit Purchase Order
              </button>
            ) : null}
            {canDelete && order.status === "DRAFT" ? (
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete ${order.poNumber}? This cannot be undone.`,
                    )
                  )
                    deleteMutation.mutate();
                }}
                className="rounded-xl border border-destructive/30 px-4 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/10"
              >
                {deleteMutation.isPending
                  ? "Deleting..."
                  : "Delete Purchase Order"}
              </button>
            ) : null}
          </div>
        </>
      )}
      <Link
        href="/app/purchase-orders"
        className="mt-6 inline-flex text-sm font-semibold text-primary hover:underline"
      >
        Back to Purchase Orders
      </Link>
    </>
  );
}
