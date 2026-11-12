"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import {
  PageHeader,
  StatusBadge,
  UnavailableState,
} from "@/components/data-display/states";
import { ApiError } from "@/lib/api/client";
import {
  getKitchenTicket,
  kitchenKeys,
} from "@/features/erp/kitchen/api/queries";
import { KitchenItemTimer } from "@/features/erp/kitchen/components/kitchen-item-timer";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";

function statusTone(status: string) {
  if (status === "READY" || status === "SERVED") return "success" as const;
  if (status === "CANCELLED") return "danger" as const;
  if (status === "COOKING" || status === "RECALLED") return "info" as const;
  return "warning" as const;
}

export function KitchenTicketDetailWorkspace({ orderId }: { orderId: string }) {
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const tenantId = session?.tenantId;
  const canRead = hasPermission(session, "kitchen.read");
  const query = useQuery({
    queryKey: tenantId
      ? kitchenKeys.detail(tenantId, orderId)
      : ["kitchen", "unauthenticated", "detail", orderId],
    queryFn: () => getKitchenTicket(token as string, orderId),
    enabled: Boolean(token && tenantId && orderId && canRead),
    staleTime: 15_000,
  });

  if (!canRead) {
    return (
      <UnavailableState
        title="Kitchen access is restricted"
        description="Your current tenant session does not include the kitchen.read permission."
      />
    );
  }
  if (query.isPending) {
    return <div className="h-72 animate-pulse rounded-3xl bg-muted" />;
  }
  if (query.isError) {
    return (
      <UnavailableState
        title="Unable to load Kitchen ticket"
        description={
          query.error instanceof ApiError && query.error.status === 404
            ? "This ticket was not found in the active tenant scope."
            : "The Kitchen API could not be reached. No placeholder ticket details are shown."
        }
      />
    );
  }

  const ticket = query.data;
  return (
    <div className="kitchen-ticket-print">
      <PageHeader
        eyebrow="Tenant application / operations"
        title={ticket.ticketNumber}
        description="Kitchen ticket details returned by the tenant-scoped Kitchen API."
        actions={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="kitchen-ticket-print-actions rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground"
            >
              Print ticket
            </button>
            <StatusBadge tone={statusTone(ticket.status)}>
              {ticket.status}
            </StatusBadge>
          </div>
        }
      />
      <section className="rounded-3xl border border-border bg-card p-6">
        <dl className="grid gap-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Sales order
            </dt>
            <dd className="mt-2 break-all text-sm text-foreground">
              {ticket.salesOrderId}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Priority
            </dt>
            <dd className="mt-2 text-sm text-foreground">
              {ticket.priority} (higher values are prepared first)
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Outlet
            </dt>
            <dd className="mt-2 text-sm text-foreground">
              {ticket.outletId ?? "Tenant-wide"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Created
            </dt>
            <dd className="mt-2 text-sm text-foreground">
              {new Date(ticket.createdAt).toLocaleString()}
            </dd>
          </div>
        </dl>
        {ticket.waitingTooLong ? (
          <p className="mt-6 rounded-xl bg-warning/10 px-4 py-3 text-sm font-semibold text-warning">
            This queued ticket has exceeded the tenant wait threshold.
          </p>
        ) : null}
        <div className="mt-6 border-t border-border pt-5">
          <h2 className="text-base font-semibold text-foreground">
            Ordered items
          </h2>
          {ticket.items.length ? (
            <ul className="mt-3 divide-y divide-border">
              {ticket.items.map((item) => (
                <li key={item.productId} className="py-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">
                      {item.productName}
                    </span>
                    <span className="font-semibold text-foreground">
                      × {item.quantity}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {item.stationName ?? "Not routed"} ·{" "}
                    <KitchenItemTimer
                      prepTimeMinutes={item.prepTimeMinutes}
                      startedAt={item.startedAt}
                      completedAt={item.completedAt}
                    />
                  </p>
                  {item.ingredients.length ? (
                    <ul className="mt-2 space-y-1 border-l border-border pl-3 text-xs">
                      {item.ingredients.map((ingredient) => (
                        <li
                          key={ingredient.inventoryItemId}
                          className="flex justify-between gap-4 text-muted-foreground"
                        >
                          <span>{ingredient.name}</span>
                          <span>
                            {ingredient.quantity * item.quantity}{" "}
                            {ingredient.unit}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : item.recipeSnapshotAvailable ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      This product had no active recipe when the order was
                      released.
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Ingredient snapshot is unavailable for this legacy order.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No items were returned for this ticket.
            </p>
          )}
        </div>
        <Link
          href="/app/kitchen"
          className="kitchen-ticket-print-actions mt-8 inline-flex rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground"
        >
          Back to Kitchen
        </Link>
      </section>
    </div>
  );
}
