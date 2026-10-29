"use client";

import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/api/client";
import {
  EmptyState,
  SectionHeader,
  StatusBadge,
  UnavailableState,
} from "@/components/data-display/states";
import {
  cancelWarehouseTransfer,
  createWarehouseTransfer,
  getAllInventoryItems,
  getWarehouseTransfer,
  getWarehouseTransfers,
  inventoryKeys,
  receiveWarehouseTransfer,
  shipWarehouseTransfer,
  type CreateWarehouseTransferInput,
  type InventoryItem,
  type ReceiveWarehouseTransferInput,
  type WarehouseTransfer,
} from "@/features/erp/inventory/api/queries";
import {
  getWarehouses,
  warehouseKeys,
  type Warehouse,
} from "@/features/erp/warehouses/api/queries";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";

type DraftLine = { rowId: string; inventoryItemId: string; quantity: string };
type PendingCreate = {
  key: string;
  payload: string;
  input: CreateWarehouseTransferInput;
};
type PendingReceipt = {
  key: string;
  payload: string;
  input: ReceiveWarehouseTransferInput;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function canonicalCreatePayload(input: CreateWarehouseTransferInput) {
  const items = [...input.items].sort((left, right) =>
    left.inventoryItemId.localeCompare(right.inventoryItemId),
  );
  return JSON.stringify({
    sourceWarehouseId: input.sourceWarehouseId,
    destinationWarehouseId: input.destinationWarehouseId,
    items,
    note: input.note?.trim() || null,
  });
}

function canonicalReceiptPayload(input: ReceiveWarehouseTransferInput) {
  const items = [...input.items].sort((left, right) =>
    left.transferItemId.localeCompare(right.transferItemId),
  );
  return JSON.stringify({ items, note: input.note?.trim() || null });
}

function isCreateInput(value: unknown): value is CreateWarehouseTransferInput {
  if (
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    value.items.length < 1 ||
    value.items.length > 100
  )
    return false;
  return (
    typeof value.sourceWarehouseId === "string" &&
    typeof value.destinationWarehouseId === "string" &&
    value.items.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.inventoryItemId === "string" &&
        typeof entry.quantity === "number" &&
        Number.isFinite(entry.quantity) &&
        entry.quantity >= 0.1,
    ) &&
    (value.note === undefined ||
      (typeof value.note === "string" && value.note.length <= 500))
  );
}

function isReceiptInput(
  value: unknown,
): value is ReceiveWarehouseTransferInput {
  if (
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    value.items.length < 1 ||
    value.items.length > 100
  )
    return false;
  return (
    value.items.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.transferItemId === "string" &&
        typeof entry.receivedQuantity === "number" &&
        Number.isFinite(entry.receivedQuantity) &&
        entry.receivedQuantity > 0,
    ) &&
    (value.note === undefined ||
      (typeof value.note === "string" && value.note.length <= 500))
  );
}

function isPendingCreate(value: unknown): value is PendingCreate {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    typeof value.payload === "string" &&
    isCreateInput(value.input) &&
    value.payload === canonicalCreatePayload(value.input)
  );
}

function isPendingReceipt(value: unknown): value is PendingReceipt {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    typeof value.payload === "string" &&
    isReceiptInput(value.input) &&
    value.payload === canonicalReceiptPayload(value.input)
  );
}

function statusTone(status: WarehouseTransfer["status"]) {
  if (status === "RECEIVED") return "success" as const;
  if (status === "CANCELLED") return "danger" as const;
  if (status === "IN_TRANSIT" || status === "PARTIALLY_RECEIVED")
    return "info" as const;
  return "warning" as const;
}

function confirmedRejection(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 409
  );
}

function TransferReceiptHistory({ transferId }: { transferId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const tenantId = session?.tenantId;
  const query = useQuery({
    queryKey: tenantId
      ? inventoryKeys.transfer(tenantId, transferId)
      : ["inventory-transfers", "unauthenticated", transferId],
    queryFn: () => getWarehouseTransfer(token as string, transferId),
    enabled: Boolean(isOpen && token && tenantId),
    staleTime: 15_000,
  });

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="text-sm font-semibold text-primary"
      >
        {isOpen ? "Hide receipt history" : "Show receipt history"}
      </button>
      {isOpen ? (
        query.isPending ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Loading receipt history...
          </p>
        ) : query.isError ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            Unable to load receipt history for this transfer.
          </p>
        ) : query.data?.Receipts?.length ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Receipt history
            </p>
            {query.data.Receipts.map((receipt) => (
              <div
                key={receipt.id}
                className="rounded-xl border border-border p-3 text-sm"
              >
                <p>
                  {new Date(receipt.createdAt).toLocaleString()} ·{" "}
                  {receipt.CreatedBy?.email ?? "User"}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {receipt.Items.map(
                    (item) =>
                      `${item.InventoryItem?.name ?? item.inventoryItemId}: +${item.receivedQuantity}`,
                  ).join(", ")}
                </p>
                {receipt.note ? (
                  <p className="mt-1 text-muted-foreground">{receipt.note}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No receipt has been recorded for this transfer.
          </p>
        )
      ) : null}
    </div>
  );
}

export function WarehouseTransferWorkspace() {
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const tenantId = session?.tenantId;
  const canRead = hasPermission(session, "inventory.read");
  const canAdjust = hasPermission(session, "inventory.adjust");
  const queryClient = useQueryClient();
  const [sourceWarehouseId, setSourceWarehouseId] = useState("");
  const [destinationWarehouseId, setDestinationWarehouseId] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { rowId: "line-1", inventoryItemId: "", quantity: "" },
  ]);
  const [transferNote, setTransferNote] = useState("");
  const [receiptQuantities, setReceiptQuantities] = useState<
    Record<string, Record<string, string>>
  >({});
  const [receiptNotes, setReceiptNotes] = useState<Record<string, string>>({});
  const [pendingCreate, setPendingCreate] = useState(false);
  const [pendingReceipts, setPendingReceipts] = useState<
    Record<string, boolean>
  >({});
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [unknownResult, setUnknownResult] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const pendingCreateRef = useRef<PendingCreate | null>(null);
  const pendingReceiptRefs = useRef(new Map<string, PendingReceipt>());

  const transfersQuery = useQuery({
    queryKey: tenantId
      ? inventoryKeys.transfers(tenantId)
      : ["inventory-transfers", "unauthenticated"],
    queryFn: () => getWarehouseTransfers(token as string),
    enabled: Boolean(token && tenantId && canRead),
    staleTime: 15_000,
  });
  const inventoryQuery = useQuery({
    queryKey: tenantId
      ? inventoryKeys.all(tenantId)
      : ["inventory", "unauthenticated"],
    queryFn: () => getAllInventoryItems(token as string),
    enabled: Boolean(token && tenantId && canRead && canAdjust),
    staleTime: 30_000,
  });
  const warehousesQuery = useQuery({
    queryKey: tenantId
      ? warehouseKeys.all(tenantId)
      : ["warehouses", "unauthenticated"],
    queryFn: () => getWarehouses(token as string),
    enabled: Boolean(token && tenantId && canRead && canAdjust),
    staleTime: 30_000,
  });
  const createStorageKey = tenantId
    ? `warehouse-transfer:${tenantId}:pending-create`
    : null;

  useEffect(() => {
    if (!createStorageKey) return;
    let stored: string | null;
    try {
      stored = window.sessionStorage.getItem(createStorageKey);
    } catch {
      setStorageError(
        "Browser storage is unavailable. Transfer mutations are disabled to preserve safe retries.",
      );
      return;
    }
    if (!stored) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(stored);
    } catch {
      setStorageError(
        "Saved transfer retry data is invalid. Clear the invalid session data before submitting.",
      );
      return;
    }
    if (!isPendingCreate(parsed)) {
      setStorageError(
        "Saved transfer retry data is invalid. Clear the invalid session data before submitting.",
      );
      return;
    }
    pendingCreateRef.current = parsed;
    setPendingCreate(true);
    setSourceWarehouseId(parsed.input.sourceWarehouseId);
    setDestinationWarehouseId(parsed.input.destinationWarehouseId);
    setTransferNote(parsed.input.note ?? "");
    setLines(
      parsed.input.items.map((item, index) => ({
        rowId: `restored-${index}`,
        inventoryItemId: item.inventoryItemId,
        quantity: String(item.quantity),
      })),
    );
    setMutationError(
      "A previous transfer request may still be pending. Retry with the saved details to reuse its idempotency key.",
    );
    setUnknownResult(true);
  }, [createStorageKey]);

  useEffect(() => {
    const transfers = transfersQuery.data?.data;
    if (!tenantId || !transfers) return;
    for (const transfer of transfers) {
      if (pendingReceiptRefs.current.has(transfer.id)) continue;
      const storageKey = `warehouse-transfer:${tenantId}:${transfer.id}:pending-receipt`;
      let stored: string | null;
      try {
        stored = window.sessionStorage.getItem(storageKey);
      } catch {
        setStorageError(
          "Browser storage is unavailable. Transfer mutations are disabled to preserve safe retries.",
        );
        return;
      }
      if (!stored) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(stored);
      } catch {
        setStorageError(
          "Saved receipt retry data is invalid. Clear the invalid session data before submitting.",
        );
        return;
      }
      if (!isPendingReceipt(parsed)) {
        setStorageError(
          "Saved receipt retry data is invalid. Clear the invalid session data before submitting.",
        );
        return;
      }
      pendingReceiptRefs.current.set(transfer.id, parsed);
      setPendingReceipts((current) => ({ ...current, [transfer.id]: true }));
      setReceiptQuantities((current) => ({
        ...current,
        [transfer.id]: Object.fromEntries(
          parsed.input.items.map((item) => [
            item.transferItemId,
            String(item.receivedQuantity),
          ]),
        ),
      }));
      setReceiptNotes((current) => ({
        ...current,
        [transfer.id]: parsed.input.note ?? "",
      }));
      setMutationError(
        "A previous transfer receipt may still be pending. Retry with the saved details to reuse its idempotency key.",
      );
      setUnknownResult(true);
    }
  }, [tenantId, transfersQuery.data]);

  const invalidateTransfers = async (inventoryChanged = false) => {
    if (!tenantId) return;
    await queryClient.invalidateQueries({
      queryKey: inventoryKeys.transfers(tenantId),
    });
    if (inventoryChanged) {
      await queryClient.invalidateQueries({
        queryKey: inventoryKeys.history(tenantId),
      });
      await queryClient.invalidateQueries({
        queryKey: inventoryKeys.list(tenantId),
      });
      await queryClient.invalidateQueries({
        queryKey: inventoryKeys.all(tenantId),
      });
      await queryClient.invalidateQueries({
        queryKey: inventoryKeys.stockBalancesForTenant(tenantId),
      });
    }
  };

  const createMutation = useMutation({
    mutationFn: ({ key, input }: PendingCreate) => {
      if (!token) throw new Error("Authentication required");
      return createWarehouseTransfer(token, key, input);
    },
    retry: 0,
    onSuccess: async () => {
      if (createStorageKey) {
        try {
          window.sessionStorage.removeItem(createStorageKey);
        } catch {
          setStorageError(
            "Transfer was created, but retry data could not be cleared. Verify the transfer list before creating another.",
          );
        }
      }
      pendingCreateRef.current = null;
      setPendingCreate(false);
      setLines([
        { rowId: crypto.randomUUID(), inventoryItemId: "", quantity: "" },
      ]);
      setSourceWarehouseId("");
      setDestinationWarehouseId("");
      setTransferNote("");
      setMutationError(null);
      setUnknownResult(false);
      await invalidateTransfers();
    },
    onError: (error) => {
      if (confirmedRejection(error)) {
        if (createStorageKey) {
          try {
            window.sessionStorage.removeItem(createStorageKey);
          } catch {
            setStorageError(
              "The request was rejected, but saved retry data could not be cleared.",
            );
          }
        }
        pendingCreateRef.current = null;
        setPendingCreate(false);
      }
      setMutationError(
        error instanceof Error
          ? error.message
          : "Unable to create warehouse transfer.",
      );
      setUnknownResult(!confirmedRejection(error));
    },
  });

  const shipMutation = useMutation({
    mutationFn: (transferId: string) => {
      if (!token) throw new Error("Authentication required");
      return shipWarehouseTransfer(token, transferId);
    },
    retry: 0,
    onSuccess: async () => {
      setMutationError(null);
      setUnknownResult(false);
      await invalidateTransfers(true);
    },
    onError: (error) => {
      setMutationError(
        error instanceof Error ? error.message : "Unable to ship transfer.",
      );
      setUnknownResult(!(error instanceof ApiError) || error.status >= 500);
    },
  });

  const receiptMutation = useMutation({
    mutationFn: ({
      transferId,
      key,
      input,
    }: {
      transferId: string;
      key: string;
      input: ReceiveWarehouseTransferInput;
    }) => {
      if (!token) throw new Error("Authentication required");
      return receiveWarehouseTransfer(token, transferId, key, input);
    },
    retry: 0,
    onSuccess: async (_, variables) => {
      const storageKey = `warehouse-transfer:${tenantId}:${variables.transferId}:pending-receipt`;
      try {
        window.sessionStorage.removeItem(storageKey);
      } catch {
        setStorageError(
          "Receipt was recorded but retry data could not be cleared. Verify transfer history before retrying.",
        );
      }
      pendingReceiptRefs.current.delete(variables.transferId);
      setPendingReceipts((current) => ({
        ...current,
        [variables.transferId]: false,
      }));
      setReceiptQuantities((current) => ({
        ...current,
        [variables.transferId]: {},
      }));
      setReceiptNotes((current) => ({
        ...current,
        [variables.transferId]: "",
      }));
      setMutationError(null);
      setUnknownResult(false);
      await invalidateTransfers(true);
    },
    onError: (error, variables) => {
      if (confirmedRejection(error)) {
        try {
          window.sessionStorage.removeItem(
            `warehouse-transfer:${tenantId}:${variables.transferId}:pending-receipt`,
          );
        } catch {
          setStorageError(
            "The receipt request was rejected, but saved retry data could not be cleared.",
          );
        }
        pendingReceiptRefs.current.delete(variables.transferId);
        setPendingReceipts((current) => ({
          ...current,
          [variables.transferId]: false,
        }));
      }
      setMutationError(
        error instanceof Error
          ? error.message
          : "Unable to record transfer receipt.",
      );
      setUnknownResult(!confirmedRejection(error));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (transferId: string) => {
      if (!token) throw new Error("Authentication required");
      return cancelWarehouseTransfer(token, transferId);
    },
    retry: 0,
    onSuccess: async () => {
      setMutationError(null);
      setUnknownResult(false);
      await invalidateTransfers();
    },
    onError: (error) => {
      setMutationError(
        error instanceof Error ? error.message : "Unable to cancel transfer.",
      );
      setUnknownResult(!(error instanceof ApiError) || error.status >= 500);
    },
  });

  if (!canRead) {
    return (
      <UnavailableState
        title="Inventory access is restricted"
        description="Your session does not include inventory.read."
      />
    );
  }
  if (transfersQuery.isPending) {
    return <div className="h-48 animate-pulse rounded-3xl bg-muted" />;
  }
  if (transfersQuery.isError) {
    return (
      <UnavailableState
        title="Unable to load warehouse transfers"
        description="The tenant-scoped Inventory API did not return transfer history."
      />
    );
  }

  const warehouses: Warehouse[] = warehousesQuery.data ?? [];
  const activeWarehouses = warehouses.filter((warehouse) => warehouse.isActive);
  const inventoryItems: InventoryItem[] = inventoryQuery.data ?? [];
  const transfers = transfersQuery.data?.data ?? [];
  const isMutating =
    createMutation.isPending ||
    shipMutation.isPending ||
    receiptMutation.isPending ||
    cancelMutation.isPending;

  const submitCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!tenantId || !createStorageKey || storageError) return;
    const requestedItems = lines
      .filter((line) => line.inventoryItemId && line.quantity.trim())
      .map((line) => ({
        inventoryItemId: line.inventoryItemId,
        quantity: Number(line.quantity),
      }));
    if (
      !sourceWarehouseId ||
      !destinationWarehouseId ||
      !requestedItems.length ||
      requestedItems.some(
        (item) => !Number.isFinite(item.quantity) || item.quantity < 0.1,
      )
    ) {
      setMutationError(
        "Choose different source and destination warehouses and enter valid transfer quantities.",
      );
      setUnknownResult(false);
      return;
    }
    const input: CreateWarehouseTransferInput = {
      sourceWarehouseId,
      destinationWarehouseId,
      items: requestedItems,
      ...(transferNote.trim() ? { note: transferNote.trim() } : {}),
    };
    const payload = canonicalCreatePayload(input);
    const pending = pendingCreateRef.current;
    if (pending && pending.payload !== payload) {
      setMutationError(
        "Retry or resolve the pending transfer before changing its details.",
      );
      setUnknownResult(true);
      return;
    }
    const submission = pending ?? { key: crypto.randomUUID(), payload, input };
    try {
      window.sessionStorage.setItem(
        createStorageKey,
        JSON.stringify(submission),
      );
    } catch {
      setStorageError(
        "Unable to save transfer retry data. The transfer was not submitted.",
      );
      return;
    }
    pendingCreateRef.current = submission;
    setPendingCreate(true);
    setMutationError(null);
    setUnknownResult(false);
    createMutation.mutate(submission);
  };

  const submitReceipt = (
    event: React.FormEvent<HTMLFormElement>,
    transfer: WarehouseTransfer,
  ) => {
    event.preventDefault();
    if (!tenantId || storageError) return;
    const quantities = receiptQuantities[transfer.id] ?? {};
    const items = transfer.Items.filter((item) =>
      quantities[item.id]?.trim(),
    ).map((item) => ({
      transferItemId: item.id,
      receivedQuantity: Number(quantities[item.id]),
    }));
    if (
      !items.length ||
      items.some(
        (item) =>
          !Number.isFinite(item.receivedQuantity) || item.receivedQuantity <= 0,
      )
    ) {
      setMutationError(
        "Enter valid receipt quantities for at least one transfer line.",
      );
      setUnknownResult(false);
      return;
    }
    const note = receiptNotes[transfer.id]?.trim();
    const input: ReceiveWarehouseTransferInput = {
      items,
      ...(note ? { note } : {}),
    };
    const payload = canonicalReceiptPayload(input);
    const pending = pendingReceiptRefs.current.get(transfer.id);
    if (pending && pending.payload !== payload) {
      setMutationError(
        "Retry or resolve the pending receipt before changing its quantities.",
      );
      setUnknownResult(true);
      return;
    }
    const submission = pending ?? { key: crypto.randomUUID(), payload, input };
    const storageKey = `warehouse-transfer:${tenantId}:${transfer.id}:pending-receipt`;
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(submission));
    } catch {
      setStorageError(
        "Unable to save receipt retry data. The receipt was not submitted.",
      );
      return;
    }
    pendingReceiptRefs.current.set(transfer.id, submission);
    setPendingReceipts((current) => ({ ...current, [transfer.id]: true }));
    setMutationError(null);
    setUnknownResult(false);
    receiptMutation.mutate({ transferId: transfer.id, ...submission });
  };

  return (
    <div className="space-y-6">
      {mutationError ? (
        <p
          role="alert"
          className={`rounded-xl border px-4 py-3 text-sm ${unknownResult ? "border-warning/30 bg-warning/10 text-warning" : "border-destructive/30 bg-destructive/10 text-destructive"}`}
        >
          {mutationError}
        </p>
      ) : null}
      {storageError ? (
        <p
          role="alert"
          className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
        >
          {storageError}
        </p>
      ) : null}
      {canAdjust ? (
        <section className="rounded-3xl border border-border bg-card p-5">
          <SectionHeader
            eyebrow="Warehouse operations"
            title="Create stock transfer"
          />
          <p className="mb-4 text-sm text-muted-foreground">
            Creating a transfer does not reserve stock. Stock is deducted
            atomically when shipped; destination stock increases as partial
            receipts are recorded.
          </p>
          {warehousesQuery.isError || inventoryQuery.isError ? (
            <UnavailableState
              title="Transfer form unavailable"
              description="Warehouses and inventory items could not be loaded. No transfer was submitted."
            />
          ) : (
            <form onSubmit={submitCreate} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  Source warehouse
                  <select
                    required
                    value={sourceWarehouseId}
                    disabled={
                      pendingCreate || isMutating || Boolean(storageError)
                    }
                    onChange={(event) =>
                      setSourceWarehouseId(event.target.value)
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3"
                  >
                    <option value="">Select source</option>
                    {activeWarehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name} ({warehouse.code})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium">
                  Destination warehouse
                  <select
                    required
                    value={destinationWarehouseId}
                    disabled={
                      pendingCreate || isMutating || Boolean(storageError)
                    }
                    onChange={(event) =>
                      setDestinationWarehouseId(event.target.value)
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3"
                  >
                    <option value="">Select destination</option>
                    {activeWarehouses.map((warehouse) => (
                      <option
                        key={warehouse.id}
                        value={warehouse.id}
                        disabled={warehouse.id === sourceWarehouseId}
                      >
                        {warehouse.name} ({warehouse.code})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="space-y-3">
                {lines.map((line, index) => (
                  <div
                    key={line.rowId}
                    className="grid gap-3 sm:grid-cols-[1fr_10rem_auto]"
                  >
                    <label className="text-sm font-medium">
                      Inventory item
                      <select
                        required
                        value={line.inventoryItemId}
                        disabled={
                          pendingCreate || isMutating || Boolean(storageError)
                        }
                        onChange={(event) =>
                          setLines((current) =>
                            current.map((entry) =>
                              entry.rowId === line.rowId
                                ? {
                                    ...entry,
                                    inventoryItemId: event.target.value,
                                  }
                                : entry,
                            ),
                          )
                        }
                        className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3"
                      >
                        <option value="">Select item</option>
                        {inventoryItems.map((item) => (
                          <option
                            key={item.id}
                            value={item.id}
                            disabled={lines.some(
                              (entry) =>
                                entry.rowId !== line.rowId &&
                                entry.inventoryItemId === item.id,
                            )}
                          >
                            {item.name} ({item.code})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-medium">
                      Quantity
                      <input
                        required
                        type="number"
                        min="0.1"
                        step="any"
                        value={line.quantity}
                        disabled={
                          pendingCreate || isMutating || Boolean(storageError)
                        }
                        onChange={(event) =>
                          setLines((current) =>
                            current.map((entry) =>
                              entry.rowId === line.rowId
                                ? { ...entry, quantity: event.target.value }
                                : entry,
                            ),
                          )
                        }
                        className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3"
                      />
                    </label>
                    <button
                      type="button"
                      aria-label={`Remove transfer line ${index + 1}`}
                      disabled={
                        lines.length === 1 ||
                        pendingCreate ||
                        isMutating ||
                        Boolean(storageError)
                      }
                      onClick={() =>
                        setLines((current) =>
                          current.filter((entry) => entry.rowId !== line.rowId),
                        )
                      }
                      className="self-end rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={
                    lines.length >= 100 ||
                    pendingCreate ||
                    isMutating ||
                    Boolean(storageError)
                  }
                  onClick={() =>
                    setLines((current) => [
                      ...current,
                      {
                        rowId: crypto.randomUUID(),
                        inventoryItemId: "",
                        quantity: "",
                      },
                    ])
                  }
                  className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40"
                >
                  Add item
                </button>
              </div>
              <label className="block text-sm font-medium">
                Transfer note (optional)
                <input
                  maxLength={500}
                  value={transferNote}
                  disabled={
                    pendingCreate || isMutating || Boolean(storageError)
                  }
                  onChange={(event) => setTransferNote(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3"
                />
              </label>
              <button
                type="submit"
                disabled={isMutating || Boolean(storageError)}
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {createMutation.isPending
                  ? "Creating transfer..."
                  : pendingCreate
                    ? "Retry transfer"
                    : "Create transfer"}
              </button>
            </form>
          )}
        </section>
      ) : null}

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Tenant-scoped transfer ledger"
          title="Warehouse transfers"
        />
        {!transfers.length ? (
          <EmptyState
            title="No warehouse transfers"
            description="Transfer requests and receipts will appear here after they are created."
          />
        ) : (
          transfers.map((transfer) => {
            const canShip = canAdjust && transfer.status === "PENDING";
            const canReceive =
              canAdjust &&
              (transfer.status === "IN_TRANSIT" ||
                transfer.status === "PARTIALLY_RECEIVED");
            const receiptPending = pendingReceipts[transfer.id] ?? false;
            return (
              <article
                key={transfer.id}
                className="rounded-3xl border border-border bg-card p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {transfer.SourceWarehouse.name} →{" "}
                      {transfer.DestinationWarehouse.name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(transfer.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <StatusBadge tone={statusTone(transfer.status)}>
                    {transfer.status}
                  </StatusBadge>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-muted text-muted-foreground">
                      <tr>
                        {["Item", "Shipped", "Received", "Remaining"].map(
                          (heading) => (
                            <th
                              key={heading}
                              className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em]"
                            >
                              {heading}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {transfer.Items.map((item) => {
                        const remaining = Math.max(
                          0,
                          item.quantity - item.receivedQuantity,
                        );
                        return (
                          <tr key={item.id} className="border-t border-border">
                            <td className="px-3 py-3">
                              {item.InventoryItem?.name ?? item.inventoryItemId}
                            </td>
                            <td className="px-3 py-3">{item.quantity}</td>
                            <td className="px-3 py-3">
                              {item.receivedQuantity}
                            </td>
                            <td className="px-3 py-3">{remaining}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {transfer.note ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {transfer.note}
                  </p>
                ) : null}
                <TransferReceiptHistory transferId={transfer.id} />
                {canShip ||
                canReceive ||
                (canAdjust && transfer.status === "PENDING") ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {canShip ? (
                      <button
                        type="button"
                        disabled={isMutating || Boolean(storageError)}
                        onClick={() => shipMutation.mutate(transfer.id)}
                        className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {shipMutation.isPending
                          ? "Shipping..."
                          : "Ship transfer"}
                      </button>
                    ) : null}
                    {canAdjust && transfer.status === "PENDING" ? (
                      <button
                        type="button"
                        disabled={isMutating || Boolean(storageError)}
                        onClick={() => cancelMutation.mutate(transfer.id)}
                        className="rounded-xl border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    ) : null}
                    {canReceive ? (
                      <form
                        onSubmit={(event) => submitReceipt(event, transfer)}
                        className="w-full space-y-3 rounded-2xl border border-border p-4"
                      >
                        <p className="text-sm font-semibold">
                          Record delivery received
                        </p>
                        {transfer.Items.map((item) => {
                          const remaining = Math.max(
                            0,
                            item.quantity - item.receivedQuantity,
                          );
                          return (
                            <label
                              key={item.id}
                              className="grid items-center gap-3 text-sm sm:grid-cols-[1fr_9rem]"
                            >
                              {item.InventoryItem?.name ?? item.inventoryItemId}{" "}
                              · {remaining} remaining
                              <input
                                type="number"
                                max={remaining}
                                step="any"
                                value={
                                  receiptQuantities[transfer.id]?.[item.id] ??
                                  ""
                                }
                                disabled={
                                  receiptPending ||
                                  isMutating ||
                                  Boolean(storageError) ||
                                  remaining <= 0
                                }
                                onChange={(event) =>
                                  setReceiptQuantities((current) => ({
                                    ...current,
                                    [transfer.id]: {
                                      ...current[transfer.id],
                                      [item.id]: event.target.value,
                                    },
                                  }))
                                }
                                className="h-10 rounded-lg border border-border bg-background px-3"
                              />
                            </label>
                          );
                        })}
                        <label className="block text-sm font-medium">
                          Receipt note (optional)
                          <input
                            maxLength={500}
                            value={receiptNotes[transfer.id] ?? ""}
                            disabled={
                              receiptPending ||
                              isMutating ||
                              Boolean(storageError)
                            }
                            onChange={(event) =>
                              setReceiptNotes((current) => ({
                                ...current,
                                [transfer.id]: event.target.value,
                              }))
                            }
                            className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3"
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={isMutating || Boolean(storageError)}
                          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {receiptMutation.isPending &&
                          receiptMutation.variables?.transferId === transfer.id
                            ? "Recording..."
                            : receiptPending
                              ? "Retry receipt"
                              : "Record partial receipt"}
                        </button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
