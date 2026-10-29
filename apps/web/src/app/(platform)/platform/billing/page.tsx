"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useMutation, useQuery } from "@tanstack/react-query"

import { EmptyState, PageHeader, SectionHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError, saveBlob } from "@/lib/api/client"
import { hasPermission } from "@/lib/permissions"
import { downloadPlatformInvoices, getPlatformInvoices, type PlatformInvoice } from "@/features/platform/api/queries"
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
	const [filters, setFilters] = useState({ from: "", to: "", status: "" })
	const query = useQuery({
		queryKey: ["platform-billing-invoices"],
		queryFn: () => getPlatformInvoices(token as string),
		enabled: Boolean(token && canRead),
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
			<section className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
				<label className="text-xs font-semibold text-[var(--muted-foreground)]">From<input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} className="mt-1 block rounded-lg border border-[var(--border)] bg-[var(--panel-alt)] px-3 py-2 text-sm text-[var(--foreground)]" /></label>
				<label className="text-xs font-semibold text-[var(--muted-foreground)]">To<input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} className="mt-1 block rounded-lg border border-[var(--border)] bg-[var(--panel-alt)] px-3 py-2 text-sm text-[var(--foreground)]" /></label>
				<label className="text-xs font-semibold text-[var(--muted-foreground)]">Status<select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="mt-1 block rounded-lg border border-[var(--border)] bg-[var(--panel-alt)] px-3 py-2 text-sm text-[var(--foreground)]"><option value="">All statuses</option>{["PENDING", "PAID", "FAILED", "CANCELLED", "REFUNDED"].map((status) => <option key={status}>{status}</option>)}</select></label>
				<button type="button" disabled={exportMutation.isPending} onClick={() => exportMutation.mutate()} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] disabled:opacity-50">{exportMutation.isPending ? "Preparing CSV..." : "Export CSV"}</button>
				{exportMutation.isError ? <p role="alert" className="text-sm text-[var(--danger)]">{exportMutation.error instanceof ApiError ? exportMutation.error.message : "Invoice export failed."}</p> : null}
			</section>
			{query.isPending ? <div className="h-56 animate-pulse rounded-3xl bg-[var(--muted)]" /> : query.isError ? (
				<UnavailableState title="Unable to load invoices" description={query.error instanceof ApiError && query.error.status === 403 ? "This platform session is not authorized to read invoices." : "The platform invoice API could not be reached."} />
			) : !query.data?.length ? <EmptyState title="No invoices found" description="The platform API returned an empty invoice collection." /> : (
				<section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.03)]">
					<SectionHeader eyebrow="Invoice directory" title="Tenant invoices" />
					<div className="mt-4 space-y-3">{query.data.map((invoice) => <InvoiceRow key={invoice.id} invoice={invoice} />)}</div>
				</section>
			)}
		</>
	)
}
