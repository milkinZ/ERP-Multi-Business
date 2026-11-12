"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useMutation, useQuery } from "@tanstack/react-query"

import { EmptyState, PageHeader, SectionHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError, saveBlob } from "@/lib/api/client"
import { hasPermission } from "@/lib/permissions"
import { downloadPlatformInvoices, getPlatformBillingAggregate, getPlatformInvoices, type PlatformInvoice } from "@/features/platform/api/queries"
import { useAuthStore } from "@/stores/auth.store"

function statusTone(status: string) {
	if (status === "PAID") return "success" as const
	if (status === "FAILED") return "danger" as const
	if (status === "PENDING") return "warning" as const
	return "neutral" as const
}

function formatDate(value?: string | null) {
	return value ? new Date(value).toLocaleString() : "-"
}

function InvoiceRow({ invoice }: { invoice: PlatformInvoice }) {
	return (
		<article className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel-alt)] p-4 lg:grid lg:grid-cols-[1.3fr_1fr_1fr_auto] lg:items-center">
			<div className="min-w-0">
				<Link href={`/platform/billing/${encodeURIComponent(invoice.id)}`} className="font-medium text-[var(--foreground)] hover:text-[var(--primary)]">{invoice.invoiceNumber}</Link>
				<p className="mt-1 break-all text-xs text-[var(--muted-foreground)]">{invoice.id}</p>
			</div>
			<div>
				<p className="text-sm text-[var(--foreground)]">{invoice.tenant.name}</p>
				<p className="mt-1 break-all text-xs text-[var(--muted-foreground)]">{invoice.tenantId}</p>
			</div>
			<div>
				<p className="text-sm font-medium text-[var(--foreground)]">{invoice.currency} {invoice.amountCents.toLocaleString("en-US")}</p>
				<p className="mt-1 text-xs text-[var(--muted-foreground)]">Created {formatDate(invoice.createdAt)}</p>
			</div>
			<StatusBadge tone={statusTone(invoice.status)}>{invoice.status}</StatusBadge>
		</article>
	)
}

export default function PlatformBillingPage() {
	const token = useAuthStore((state) => state.accessToken)
	const session = useAuthStore((state) => state.session)
	const canRead = hasPermission(session, "super-admin.read")
	const [page, setPage] = useState(1)
	const [filters, setFilters] = useState({ from: "", to: "", status: "", tenantId: "", subscriptionId: "" })
	const query = useQuery({
		queryKey: ["platform-billing-invoices", page, filters],
		queryFn: () => getPlatformInvoices(token as string, { ...filters, page }),
		enabled: Boolean(token && canRead),
	})
	const aggregateQuery = useQuery({
		queryKey: ["platform-billing-aggregate"],
		queryFn: () => getPlatformBillingAggregate(token as string),
		enabled: Boolean(token && canRead),
		staleTime: 30_000,
	})
	const exportMutation = useMutation({
		mutationFn: () => downloadPlatformInvoices(token as string, filters),
		retry: 0,
		onSuccess: (blob) => saveBlob(blob, "platform-invoices.csv"),
	})

	if (!canRead) return <UnavailableState title="Billing access is restricted" description="Your platform session does not include the super-admin read permission." />
	if (!token) return <UnavailableState title="Platform authentication is required" description="Sign in with an authorized platform operator session to view invoices." />

	return (
		<>
			<PageHeader eyebrow="Platform console / financial records" title="Billing" description="Cross-tenant invoice records and audited, filtered CSV exports." actions={<StatusBadge tone="info">Read only</StatusBadge>} />
			{aggregateQuery.data ? (
				<section className="mb-5 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
					<SectionHeader eyebrow="Billing summary" title="Invoice totals by status and currency" />
					<div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
						{aggregateQuery.data.invoices.byStatusAndCurrency.map((item) => (
							<div key={`${item.status}-${item.currency}`} className="rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3">
								<p className="text-xs text-[var(--muted-foreground)]">{item.status} · {item.currency}</p>
								<p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{item.count.toLocaleString("en-US")} invoices</p>
								<p className="mt-1 text-xs text-[var(--muted-foreground)]">{item.amountCents.toLocaleString("en-US")} cents</p>
							</div>
						))}
					</div>
				</section>
			) : aggregateQuery.isError ? <p role="status" className="mb-5 text-sm text-[var(--muted-foreground)]">Billing summary is currently unavailable.</p> : null}
			<section className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
				<label className="text-xs font-semibold text-[var(--muted-foreground)]">From<input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} className="mt-1 block rounded-lg border border-[var(--border)] bg-[var(--panel-alt)] px-3 py-2 text-sm text-[var(--foreground)]" /></label>
				<label className="text-xs font-semibold text-[var(--muted-foreground)]">To<input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} className="mt-1 block rounded-lg border border-[var(--border)] bg-[var(--panel-alt)] px-3 py-2 text-sm text-[var(--foreground)]" /></label>
				<label className="text-xs font-semibold text-[var(--muted-foreground)]">Status<select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="mt-1 block rounded-lg border border-[var(--border)] bg-[var(--panel-alt)] px-3 py-2 text-sm text-[var(--foreground)]"><option value="">All statuses</option>{["PENDING", "PAID", "FAILED", "CANCELLED", "REFUNDED"].map((status) => <option key={status}>{status}</option>)}</select></label>
				<label className="text-xs font-semibold text-[var(--muted-foreground)]">Tenant ID<input value={filters.tenantId} onChange={(event) => setFilters((current) => ({ ...current, tenantId: event.target.value }))} className="mt-1 block w-52 rounded-lg border border-[var(--border)] bg-[var(--panel-alt)] px-3 py-2 text-sm text-[var(--foreground)]" /></label>
				<label className="text-xs font-semibold text-[var(--muted-foreground)]">Subscription ID<input value={filters.subscriptionId} onChange={(event) => setFilters((current) => ({ ...current, subscriptionId: event.target.value }))} className="mt-1 block w-52 rounded-lg border border-[var(--border)] bg-[var(--panel-alt)] px-3 py-2 text-sm text-[var(--foreground)]" /></label>
				<button type="button" disabled={exportMutation.isPending} onClick={() => exportMutation.mutate()} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] disabled:opacity-50">{exportMutation.isPending ? "Preparing CSV..." : "Export CSV"}</button>
				{exportMutation.isError ? <p role="alert" className="text-sm text-[var(--danger)]">{exportMutation.error instanceof ApiError ? exportMutation.error.message : "Invoice export failed."}</p> : null}
			</section>
			{query.isPending ? <div className="h-56 animate-pulse rounded-3xl bg-[var(--muted)]" /> : query.isError ? (
				<UnavailableState title="Unable to load invoices" description={query.error instanceof ApiError && query.error.status === 403 ? "This platform session is not authorized to read invoices." : "The platform invoice API could not be reached."} />
			) : !query.data?.data.length ? <EmptyState title="No invoices found" description="The platform API returned no invoices for the selected filters." /> : (
				<section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.03)]">
					<SectionHeader eyebrow="Invoice directory" title="Tenant invoices" />
					<div className="mt-4 space-y-3">{query.data.data.map((invoice) => <InvoiceRow key={invoice.id} invoice={invoice} />)}</div>
					<div className="mt-5 flex items-center justify-between">
						<p className="text-xs text-[var(--muted-foreground)]">Page {query.data.pagination.page} of {Math.max(query.data.pagination.totalPages, 1)} · {query.data.pagination.total.toLocaleString("en-US")} invoices</p>
						<div className="flex gap-2">
							<button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50">Previous</button>
							<button type="button" disabled={page >= query.data.pagination.totalPages} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50">Next</button>
						</div>
					</div>
				</section>
			)}
		</>
	)
}
