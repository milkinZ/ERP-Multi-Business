"use client"

import React, { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { EmptyState, SectionHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { orderKeys } from "@/features/erp/orders/api/queries"
import { cancelKitchenTicket, getKitchenQueue, kitchenKeys, markKitchenReady, recallKitchenTicket, serveKitchenTicket, startKitchenTicket, type KitchenStatus, type KitchenTicket } from "@/features/erp/kitchen/api/queries"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth.store"

const statuses: KitchenStatus[] = ["NEW", "QUEUED", "COOKING", "READY", "RECALLED", "SERVED", "CANCELLED"]
const actions: Partial<Record<KitchenStatus, Array<{ label: string; target: KitchenStatus; run: (token: string, orderId: string) => Promise<KitchenTicket> }>>> = {
  QUEUED: [{ label: "Start cooking", target: "COOKING", run: startKitchenTicket }],
  RECALLED: [{ label: "Resume cooking", target: "COOKING", run: startKitchenTicket }],
  COOKING: [{ label: "Mark ready", target: "READY", run: markKitchenReady }, { label: "Recall", target: "RECALLED", run: recallKitchenTicket }, { label: "Cancel", target: "CANCELLED", run: cancelKitchenTicket }],
  READY: [{ label: "Mark served", target: "SERVED", run: serveKitchenTicket }, { label: "Recall", target: "RECALLED", run: recallKitchenTicket }],
  NEW: [],
}

function statusTone(status: KitchenStatus) {
  if (status === "READY" || status === "SERVED") return "success" as const
  if (status === "CANCELLED") return "danger" as const
  if (status === "COOKING" || status === "RECALLED") return "info" as const
  return "warning" as const
}

function TicketCard({ ticket, canUpdate, onAction, pendingOrderId }: { ticket: KitchenTicket; canUpdate: boolean; onAction: (ticket: KitchenTicket, action: NonNullable<typeof actions[KitchenStatus]>[number]) => void; pendingOrderId: string | null }) {
  const ticketActions = actions[ticket.status] ?? []
  return <article className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{ticket.ticketNumber}</p><h3 className="mt-2 font-semibold text-foreground">Order {ticket.salesOrderId}</h3></div><StatusBadge tone={statusTone(ticket.status)}>{ticket.status}</StatusBadge></div><dl className="mt-4 space-y-2 text-sm">{ticket.items.map((item) => <div key={item.productId} className="flex justify-between gap-3 border-b border-border/60 pb-2 last:border-0"><dt className="text-muted-foreground">{item.productName}</dt><dd className="font-medium text-foreground">× {item.quantity}</dd></div>)}</dl><div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>{ticket.outletId ? `Outlet ${ticket.outletId}` : "Tenant-wide outlet scope"}</span><span>{new Date(ticket.createdAt).toLocaleTimeString()}</span></div>{canUpdate && ticketActions.length ? <div className="mt-4 flex flex-wrap gap-2">{ticketActions.map((action) => <button key={action.target} type="button" disabled={pendingOrderId === ticket.salesOrderId} onClick={() => onAction(ticket, action)} className="rounded-xl border border-border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-foreground transition hover:bg-muted disabled:opacity-50">{pendingOrderId === ticket.salesOrderId ? "Submitting..." : action.label}</button>)}</div> : null}</article>
}

export function KitchenWorkspace() {
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const tenantId = session?.tenantId
  const canRead = hasPermission(session, "kitchen.read")
  const canUpdate = hasPermission(session, "kitchen.update")
  const queryClient = useQueryClient()
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [unknownResult, setUnknownResult] = useState(false)

  const query = useQuery({ queryKey: tenantId ? kitchenKeys.queue(tenantId) : ["kitchen", "unauthenticated"], queryFn: () => getKitchenQueue(token as string), enabled: Boolean(token && tenantId && canRead), staleTime: 10_000 })
  const tickets = useMemo(() => query.data ?? [], [query.data])
  const grouped = useMemo(() => Object.fromEntries(statuses.map((status) => [status, tickets.filter((ticket) => ticket.status === status)])) as Record<KitchenStatus, KitchenTicket[]>, [tickets])

  const mutation = useMutation({
    mutationFn: ({ ticket, action }: { ticket: KitchenTicket; action: NonNullable<typeof actions[KitchenStatus]>[number] }) => {
      if (!token) throw new Error("Authentication required")
      setPendingOrderId(ticket.salesOrderId)
      return action.run(token, ticket.salesOrderId)
    },
    retry: 0,
    onSuccess: async () => {
      if (tenantId) { await queryClient.invalidateQueries({ queryKey: kitchenKeys.queue(tenantId) }); await queryClient.invalidateQueries({ queryKey: orderKeys.all(tenantId) }) }
      setPendingOrderId(null); setMutationError(null); setUnknownResult(false)
    },
    onError: (cause) => { setPendingOrderId(null); if (!(cause instanceof ApiError)) { setUnknownResult(true); setMutationError("The operation result could not be confirmed. Refresh the Kitchen state before retrying."); return } setUnknownResult(false); setMutationError(cause.status === 403 ? "You do not have permission to update Kitchen tickets." : cause.message) },
  })

  if (!canRead) return <UnavailableState title="Kitchen access is restricted" description="Your current tenant session does not include the kitchen.read permission." />
  if (query.isPending) return <div className="space-y-3"><div className="h-20 animate-pulse rounded-3xl bg-muted" /><div className="h-64 animate-pulse rounded-3xl bg-muted" /></div>
  if (query.isError) return <UnavailableState title="Unable to load Kitchen queue" description={query.error instanceof ApiError && query.error.status === 403 ? "Your session is not authorized to view the Kitchen queue." : "The Kitchen API could not be reached. No placeholder tickets are shown."} />

  const onAction = (ticket: KitchenTicket, action: NonNullable<typeof actions[KitchenStatus]>[number]) => { if (window.confirm(`${action.label} ${ticket.ticketNumber}?`)) { setMutationError(null); mutation.mutate({ ticket, action }) } }

  return <div className="space-y-6"><section className="rounded-3xl border border-border bg-card p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><SectionHeader eyebrow="Operational queue" title="Kitchen tickets" /><StatusBadge tone={canUpdate ? "success" : "neutral"}>{canUpdate ? "Actions enabled" : "Read only"}</StatusBadge></div><p className="text-sm text-muted-foreground">Kitchen tickets are backed by tenant-scoped Sales Orders. Inventory consumption is not performed by these actions.</p></section>{mutationError ? <p role="alert" className={`rounded-xl border px-4 py-3 text-sm ${unknownResult ? "border-warning/30 bg-warning/10 text-warning" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>{mutationError}</p> : null}{!tickets.length ? <EmptyState title="Kitchen queue is empty" description="The backend returned no tenant-scoped Kitchen tickets." /> : <div className="grid gap-4 xl:grid-cols-4">{statuses.filter((status) => status !== "SERVED" && status !== "CANCELLED").map((status) => <section key={status} className="rounded-3xl border border-border bg-muted/30 p-3"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold text-foreground">{status}</h2><span className="rounded-full bg-card px-2 py-1 text-xs text-muted-foreground">{grouped[status].length}</span></div><div className="space-y-3">{grouped[status].map((ticket) => <TicketCard key={ticket.id} ticket={ticket} canUpdate={canUpdate} onAction={onAction} pendingOrderId={pendingOrderId} />)}{!grouped[status].length ? <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No tickets</p> : null}</div></section>)}</div>}{tickets.some((ticket) => ticket.status === "SERVED" || ticket.status === "CANCELLED") ? <section className="rounded-3xl border border-border bg-card p-5"><SectionHeader eyebrow="Terminal tickets" title="Served and cancelled" /><div className="grid gap-3 md:grid-cols-2">{["SERVED", "CANCELLED"].flatMap((status) => grouped[status as KitchenStatus]).map((ticket) => <TicketCard key={ticket.id} ticket={ticket} canUpdate={canUpdate} onAction={onAction} pendingOrderId={pendingOrderId} />)}</div></section> : null}</div>
}
