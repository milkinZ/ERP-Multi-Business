"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"

import { EmptyState, SectionHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { useAuthStore } from "@/stores/auth.store"
import { getOrders, orderKeys } from "@/features/erp/orders/api/queries"
import { OrderForm } from "@/features/erp/orders/components/order-form"

function statusTone(status: string) {
	if (status === "PAID" || status === "COMPLETED") return "success" as const
	if (status === "CANCELLED") return "danger" as const
	if (status === "IN_PROGRESS" || status === "READY") return "info" as const
	return "warning" as const
}

function formatAmount(value: number) {
	return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)
}

export function OrderWorkspace() {
	const token = useAuthStore((state) => state.accessToken)
	const tenantId = useAuthStore((state) => state.session?.tenantId)
	const [isCreateOpen, setIsCreateOpen] = useState(false)
	const query = useQuery({
		queryKey: tenantId ? orderKeys.all(tenantId) : ["orders", "unauthenticated"],
		queryFn: () => getOrders(token as string),
		enabled: Boolean(token && tenantId),
		staleTime: 15_000,
	})

	if (query.isPending) return <div className="space-y-3"><div className="h-20 animate-pulse rounded-[24px] bg-[var(--muted)]" /><div className="h-64 animate-pulse rounded-[24px] bg-[var(--muted)]" /></div>
	if (query.isError) return <UnavailableState title="Unable to load orders" description={query.error instanceof ApiError && query.error.status === 403 ? "Your session is not authorized to view orders." : "The Orders API could not be reached. No placeholder records are shown."} />

	const orders = query.data ?? []
	const openCount = orders.filter((order) => !["COMPLETED", "CANCELLED"].includes(order.status)).length
	const paidCount = orders.filter((order) => order.status === "PAID").length

	return <div className="space-y-6"><div className="grid gap-4 md:grid-cols-3"><div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Orders returned</p><p className="mt-3 text-2xl font-semibold text-[var(--foreground)]">{orders.length}</p><p className="mt-2 text-xs text-[var(--muted-foreground)]">Tenant-scoped API result</p></div><div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Open</p><p className="mt-3 text-2xl font-semibold text-[var(--foreground)]">{openCount}</p><p className="mt-2 text-xs text-[var(--muted-foreground)]">Not completed or cancelled</p></div><div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Paid</p><p className="mt-3 text-2xl font-semibold text-[var(--foreground)]">{paidCount}</p><p className="mt-2 text-xs text-[var(--muted-foreground)]">Status returned by backend</p></div></div><div className="flex flex-col gap-4 rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-[var(--foreground)]">Sales orders</p><p className="mt-1 text-sm text-[var(--muted-foreground)]">Orders are scoped by the authenticated tenant and outlet context.</p></div><button type="button" onClick={() => setIsCreateOpen((open) => !open)} className="rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">{isCreateOpen ? "Close form" : "New order"}</button></div>{isCreateOpen ? <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5"><SectionHeader eyebrow="Commerce action" title="Create order" /><OrderForm onCreated={() => setIsCreateOpen(false)} /></section> : null}{!orders.length ? <EmptyState title="No orders yet" description="This tenant has no order records returned by the backend." /> : <section className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--panel)]"><div className="hidden overflow-x-auto md:block"><table className="min-w-full text-left text-sm"><thead className="bg-[var(--muted)] text-[var(--muted-foreground)]"><tr>{["Order", "Items", "Total", "Status", "Created"].map((heading) => <th key={heading} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em]">{heading}</th>)}</tr></thead><tbody>{orders.map((order) => <tr key={order.id} className="border-t border-[var(--border)] hover:bg-[var(--muted)]/50"><td className="px-4 py-4"><Link href={`/app/orders/${order.id}`} className="font-semibold text-[var(--foreground)] hover:text-[var(--primary)]">{order.orderNumber}</Link><p className="mt-1 text-xs text-[var(--muted-foreground)]">{order.id}</p></td><td className="px-4 py-4 text-[var(--muted-foreground)]">{order.SalesOrderItem.length}</td><td className="px-4 py-4 font-medium">{formatAmount(order.totalAmount)}</td><td className="px-4 py-4"><StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge></td><td className="px-4 py-4 text-[var(--muted-foreground)]">{new Date(order.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div><div className="divide-y divide-[var(--border)] md:hidden">{orders.map((order) => <Link key={order.id} href={`/app/orders/${order.id}`} className="block p-4 hover:bg-[var(--muted)]/50"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{order.orderNumber}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{order.SalesOrderItem.length} item(s)</p></div><StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge></div><p className="mt-4 text-lg font-semibold">{formatAmount(order.totalAmount)}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{new Date(order.createdAt).toLocaleString()}</p></Link>)}</div></section>}<p className="text-xs text-[var(--muted-foreground)]">Search, pagination, sorting, date filters, and outlet filters are unavailable because the current Orders backend does not expose those query contracts.</p></div>
}