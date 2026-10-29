"use client";

import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  EmptyState,
  SectionHeader,
  StatusBadge,
  UnavailableState,
} from "@/components/data-display/states";
import { ApiError } from "@/lib/api/client";
import { orderKeys } from "@/features/erp/orders/api/queries";
import {
  cancelKitchenTicket,
  getKitchenSettings,
  getKitchenQueueWithFilters,
  KITCHEN_QUEUE_PAGE_SIZE,
  kitchenKeys,
  markKitchenReady,
  recallKitchenTicket,
  serveKitchenTicket,
  setKitchenTicketPriority,
  startKitchenTicket,
  updateKitchenWaitThreshold,
  type KitchenStatus,
  type KitchenTicket,
} from "@/features/erp/kitchen/api/queries";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";

const statuses: KitchenStatus[] = [
  "NEW",
  "QUEUED",
  "COOKING",
  "READY",
  "RECALLED",
  "SERVED",
  "CANCELLED",
];
const actions: Partial<
  Record<
    KitchenStatus,
    Array<{
      label: string;
      target: KitchenStatus;
      run: (token: string, orderId: string) => Promise<KitchenTicket>;
    }>
  >
> = {
  QUEUED: [
    { label: "Start cooking", target: "COOKING", run: startKitchenTicket },
  ],
  RECALLED: [
    { label: "Resume cooking", target: "COOKING", run: startKitchenTicket },
  ],
  COOKING: [
    { label: "Mark ready", target: "READY", run: markKitchenReady },
    { label: "Recall", target: "RECALLED", run: recallKitchenTicket },
    { label: "Cancel", target: "CANCELLED", run: cancelKitchenTicket },
  ],
  READY: [
    { label: "Mark served", target: "SERVED", run: serveKitchenTicket },
    { label: "Recall", target: "RECALLED", run: recallKitchenTicket },
  ],
  NEW: [],
};

function statusTone(status: KitchenStatus) {
  if (status === "READY" || status === "SERVED") return "success" as const;
  if (status === "CANCELLED") return "danger" as const;
  if (status === "COOKING" || status === "RECALLED") return "info" as const;
  return "warning" as const;
}

function TicketCard({
  ticket,
  canUpdate,
  onAction,
  pendingOrderId,
  onPrioritySave,
}: {
  ticket: KitchenTicket;
  canUpdate: boolean;
  onAction: (
    ticket: KitchenTicket,
    action: NonNullable<(typeof actions)[KitchenStatus]>[number],
  ) => void;
  pendingOrderId: string | null;
  onPrioritySave: (ticket: KitchenTicket, priority: number) => void;
}) {
  const [priorityDraft, setPriorityDraft] = useState(String(ticket.priority));
  useEffect(() => setPriorityDraft(String(ticket.priority)), [ticket.priority]);
  const ticketActions = actions[ticket.status] ?? [];
  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {ticket.ticketNumber}
          </p>
          <h3 className="mt-2 font-semibold text-foreground">
            Order {ticket.salesOrderId}
          </h3>
        </div>
        <StatusBadge tone={statusTone(ticket.status)}>
          {ticket.status}
        </StatusBadge>
      </div>
      {ticket.waitingTooLong ? (
        <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-xs font-semibold text-warning">
          Waiting longer than the tenant threshold
        </p>
      ) : null}
      <dl className="mt-4 space-y-2 text-sm">
        {ticket.items.map((item) => (
          <div
            key={item.productId}
            className="flex justify-between gap-3 border-b border-border/60 pb-2 last:border-0"
          >
            <dt className="text-muted-foreground">{item.productName}</dt>
            <dd className="font-medium text-foreground">× {item.quantity}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {ticket.outletId
            ? `Outlet ${ticket.outletId}`
            : "Tenant-wide outlet scope"}
        </span>
        <span>{new Date(ticket.createdAt).toLocaleTimeString()}</span>
      </div>
      <Link
        href={`/app/kitchen/${encodeURIComponent(ticket.salesOrderId)}`}
        className="mt-3 inline-flex text-xs font-semibold text-primary hover:underline"
      >
        View ticket details
      </Link>
      {canUpdate && ticketActions.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {ticketActions.map((action) => (
            <button
              key={action.target}
              type="button"
              disabled={pendingOrderId === ticket.salesOrderId}
              onClick={() => onAction(ticket, action)}
              className="rounded-xl border border-border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-foreground transition hover:bg-muted disabled:opacity-50"
            >
              {pendingOrderId === ticket.salesOrderId
                ? "Submitting..."
                : action.label}
            </button>
          ))}
        </div>
      ) : null}
      {canUpdate ? (
        <form
          className="mt-4 flex items-end gap-2 border-t border-border pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            const priority = Number(priorityDraft);
            if (Number.isSafeInteger(priority) && priority >= 0) {
              onPrioritySave(ticket, priority);
            }
          }}
        >
          <label className="flex-1 text-xs font-medium text-muted-foreground">
            Priority (higher first; 0 = normal)
            <input
              type="number"
              min="0"
              max="2147483647"
              step="1"
              required
              value={priorityDraft}
              onChange={(event) => setPriorityDraft(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <button
            type="submit"
            disabled={pendingOrderId === ticket.salesOrderId}
            className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground disabled:opacity-50"
          >
            Save
          </button>
        </form>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Priority {ticket.priority}
        </p>
      )}
    </article>
  );
}

export function KitchenWorkspace() {
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const tenantId = session?.tenantId;
  const canRead = hasPermission(session, "kitchen.read");
  const canUpdate = hasPermission(session, "kitchen.update");
  const queryClient = useQueryClient();
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [unknownResult, setUnknownResult] = useState(false);
  const [waitThresholdDraft, setWaitThresholdDraft] = useState("15");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "QUEUED" | "COOKING" | "READY"
  >("ALL");
  const deferredSearch = useDeferredValue(search);
  const queueFilters = useMemo(
    () => ({
      ...(statusFilter === "ALL" ? {} : { status: statusFilter }),
      ...(deferredSearch.trim() ? { search: deferredSearch.trim() } : {}),
    }),
    [deferredSearch, statusFilter],
  );

  const settingsQuery = useQuery({
    queryKey: tenantId
      ? kitchenKeys.settings(tenantId)
      : ["kitchen-settings", "unauthenticated"],
    queryFn: () => getKitchenSettings(token as string),
    enabled: Boolean(token && tenantId && canRead),
  });
  const query = useInfiniteQuery({
    queryKey: tenantId
      ? kitchenKeys.queue(tenantId, queueFilters)
      : ["kitchen", "unauthenticated"],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      getKitchenQueueWithFilters(token as string, queueFilters, pageParam),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === KITCHEN_QUEUE_PAGE_SIZE
        ? allPages.length * KITCHEN_QUEUE_PAGE_SIZE
        : undefined,
    enabled: Boolean(token && tenantId && canRead),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
  useEffect(() => {
    if (settingsQuery.data) {
      setWaitThresholdDraft(String(settingsQuery.data.waitThresholdMinutes));
    }
  }, [settingsQuery.data]);
  const tickets = useMemo(
    () => query.data?.pages.flatMap((page) => page) ?? [],
    [query.data],
  );
  const grouped = useMemo(
    () =>
      Object.fromEntries(
        statuses.map((status) => [
          status,
          tickets.filter((ticket) => ticket.status === status),
        ]),
      ) as Record<KitchenStatus, KitchenTicket[]>,
    [tickets],
  );

  const mutation = useMutation({
    mutationFn: ({
      ticket,
      action,
    }: {
      ticket: KitchenTicket;
      action: NonNullable<(typeof actions)[KitchenStatus]>[number];
    }) => {
      if (!token) throw new Error("Authentication required");
      setPendingOrderId(ticket.salesOrderId);
      return action.run(token, ticket.salesOrderId);
    },
    retry: 0,
    onSuccess: async () => {
      if (tenantId) {
        await queryClient.invalidateQueries({
          queryKey: kitchenKeys.queue(tenantId),
        });
        await queryClient.invalidateQueries({
          queryKey: orderKeys.all(tenantId),
        });
      }
      setPendingOrderId(null);
      setMutationError(null);
      setUnknownResult(false);
    },
    onError: (cause) => {
      setPendingOrderId(null);
      if (!(cause instanceof ApiError)) {
        setUnknownResult(true);
        setMutationError(
          "The operation result could not be confirmed. Refresh the Kitchen state before retrying.",
        );
        return;
      }
      setUnknownResult(false);
      setMutationError(
        cause.status === 403
          ? "You do not have permission to update Kitchen tickets."
          : cause.message,
      );
    },
  });

  const priorityMutation = useMutation({
    mutationFn: ({
      ticket,
      priority,
    }: {
      ticket: KitchenTicket;
      priority: number;
    }) => {
      if (!token) throw new Error("Authentication required");
      setPendingOrderId(ticket.salesOrderId);
      return setKitchenTicketPriority(token, ticket.salesOrderId, priority);
    },
    retry: 0,
    onSuccess: async () => {
      if (tenantId) {
        await queryClient.invalidateQueries({
          queryKey: kitchenKeys.queue(tenantId),
        });
      }
      setPendingOrderId(null);
      setMutationError(null);
      setUnknownResult(false);
    },
    onError: (cause) => {
      setPendingOrderId(null);
      setUnknownResult(!(cause instanceof ApiError));
      setMutationError(
        cause instanceof ApiError
          ? cause.status === 403
            ? "You do not have permission to reprioritize Kitchen tickets."
            : cause.message
          : "Priority update result could not be confirmed. Refresh the Kitchen queue before retrying.",
      );
    },
  });

  const settingsMutation = useMutation({
    mutationFn: (waitThresholdMinutes: number) => {
      if (!token) throw new Error("Authentication required");
      return updateKitchenWaitThreshold(token, waitThresholdMinutes);
    },
    retry: 0,
    onSuccess: async () => {
      if (tenantId) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: kitchenKeys.settings(tenantId),
          }),
          queryClient.invalidateQueries({
            queryKey: kitchenKeys.queue(tenantId),
          }),
        ]);
      }
      setMutationError(null);
      setUnknownResult(false);
    },
    onError: (cause) => {
      setUnknownResult(!(cause instanceof ApiError));
      setMutationError(
        cause instanceof ApiError
          ? cause.status === 403
            ? "You do not have permission to update Kitchen settings."
            : cause.message
          : "The wait-threshold update result could not be confirmed. Refresh settings before retrying.",
      );
    },
  });

  if (!canRead)
    return (
      <UnavailableState
        title="Kitchen access is restricted"
        description="Your current tenant session does not include the kitchen.read permission."
      />
    );
  if (query.isPending)
    return (
      <div className="space-y-3">
        <div className="h-20 animate-pulse rounded-3xl bg-muted" />
        <div className="h-64 animate-pulse rounded-3xl bg-muted" />
      </div>
    );
  if (query.isError && !query.data)
    return (
      <UnavailableState
        title="Unable to load Kitchen queue"
        description={
          query.error instanceof ApiError && query.error.status === 403
            ? "Your session is not authorized to view the Kitchen queue."
            : "The Kitchen API could not be reached. No placeholder tickets are shown."
        }
      />
    );

  const onAction = (
    ticket: KitchenTicket,
    action: NonNullable<(typeof actions)[KitchenStatus]>[number],
  ) => {
    if (window.confirm(`${action.label} ${ticket.ticketNumber}?`)) {
      setMutationError(null);
      mutation.mutate({ ticket, action });
    }
  };
  const onPrioritySave = (ticket: KitchenTicket, priority: number) => {
    setMutationError(null);
    priorityMutation.mutate({ ticket, priority });
  };
  const onWaitThresholdSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const waitThresholdMinutes = Number(waitThresholdDraft);
    if (
      Number.isSafeInteger(waitThresholdMinutes) &&
      waitThresholdMinutes > 0 &&
      waitThresholdMinutes <= 2_147_483_647
    ) {
      setMutationError(null);
      settingsMutation.mutate(waitThresholdMinutes);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SectionHeader eyebrow="Operational queue" title="Kitchen tickets" />
          <StatusBadge tone={canUpdate ? "success" : "neutral"}>
            {canUpdate ? "Actions enabled" : "Read only"}
          </StatusBadge>
        </div>
        <p className="text-sm text-muted-foreground">
          Kitchen tickets are backed by tenant-scoped Sales Orders. Inventory
          consumption is not performed by these actions.
        </p>
        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Queue order: higher priority first, then FIFO by kitchen release
            time. Normal tickets are flagged after the wait threshold; their
            priority is never raised automatically.
          </p>
          {canUpdate ? (
            <form
              className="flex shrink-0 items-end gap-2"
              onSubmit={onWaitThresholdSave}
            >
              <label className="text-xs font-medium text-muted-foreground">
                Long-wait threshold (minutes)
                <input
                  type="number"
                  min="1"
                  max="2147483647"
                  step="1"
                  required
                  value={waitThresholdDraft}
                  onChange={(event) =>
                    setWaitThresholdDraft(event.target.value)
                  }
                  className="mt-1 block w-36 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
              <button
                type="submit"
                disabled={settingsMutation.isPending || settingsQuery.isPending}
                className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground disabled:opacity-50"
              >
                Save
              </button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Long-wait flag threshold:{" "}
              {settingsQuery.data?.waitThresholdMinutes ?? 15} minutes
            </p>
          )}
        </div>
        {settingsQuery.isError ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Unable to load the tenant Kitchen wait threshold.
          </p>
        ) : null}
      </section>
      <section
        aria-label="Filter Kitchen tickets"
        className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row"
      >
        <label className="flex-1 text-xs font-medium text-muted-foreground">
          Search ticket number or order ID
          <input
            type="search"
            maxLength={100}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search Kitchen tickets"
            className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Queue status
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as "ALL" | "QUEUED" | "COOKING" | "READY",
              )
            }
            className="mt-1 block min-w-44 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="ALL">All active tickets</option>
            <option value="QUEUED">Queued</option>
            <option value="COOKING">Cooking</option>
            <option value="READY">Ready</option>
          </select>
        </label>
      </section>
      {mutationError ? (
        <p
          role="alert"
          className={`rounded-xl border px-4 py-3 text-sm ${unknownResult ? "border-warning/30 bg-warning/10 text-warning" : "border-destructive/30 bg-destructive/10 text-destructive"}`}
        >
          {mutationError}
        </p>
      ) : null}
      {query.isError && query.data ? (
        <p role="alert" className="text-sm text-destructive">
          Could not refresh this page of Kitchen tickets. Previously loaded
          tickets remain visible.
        </p>
      ) : null}
      {!tickets.length ? (
        <EmptyState
          title="Kitchen queue is empty"
          description="The backend returned no tenant-scoped Kitchen tickets."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-4">
          {statuses
            .filter((status) => status !== "SERVED" && status !== "CANCELLED")
            .map((status) => (
              <section
                key={status}
                className="rounded-3xl border border-border bg-muted/30 p-3"
              >
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground">
                    {status}
                  </h2>
                  <span className="rounded-full bg-card px-2 py-1 text-xs text-muted-foreground">
                    {grouped[status].length}
                  </span>
                </div>
                <div className="space-y-3">
                  {grouped[status].map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      canUpdate={canUpdate}
                      onAction={onAction}
                      pendingOrderId={pendingOrderId}
                      onPrioritySave={onPrioritySave}
                    />
                  ))}
                  {!grouped[status].length ? (
                    <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                      No tickets
                    </p>
                  ) : null}
                </div>
              </section>
            ))}
        </div>
      )}
      {tickets.some(
        (ticket) => ticket.status === "SERVED" || ticket.status === "CANCELLED",
      ) ? (
        <section className="rounded-3xl border border-border bg-card p-5">
          <SectionHeader
            eyebrow="Terminal tickets"
            title="Served and cancelled"
          />
          <div className="grid gap-3 md:grid-cols-2">
            {["SERVED", "CANCELLED"]
              .flatMap((status) => grouped[status as KitchenStatus])
              .map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  canUpdate={canUpdate}
                  onAction={onAction}
                  pendingOrderId={pendingOrderId}
                  onPrioritySave={onPrioritySave}
                />
              ))}
          </div>
        </section>
      ) : null}
      {query.hasNextPage ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground disabled:opacity-50"
          >
            {query.isFetchingNextPage ? "Loading more..." : "Load more tickets"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
