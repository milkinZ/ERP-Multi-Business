"use client"

import React from "react"
import { useQuery } from "@tanstack/react-query"

import { EmptyState, PageHeader, SectionHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { hasPermission } from "@/lib/permissions"
import { getPlatformQueues, platformObservabilityKeys } from "@/features/platform/api/queries"
import { useAuthStore } from "@/stores/auth.store"

export default function PlatformJobsPage() {
	const token = useAuthStore((state) => state.accessToken)
	const session = useAuthStore((state) => state.session)
	const canRead = hasPermission(session, "super-admin.read")
	const query = useQuery({
		queryKey: platformObservabilityKeys.queues(),
		queryFn: () => getPlatformQueues(token as string),
		enabled: Boolean(token && canRead),
		staleTime: 15_000,
	})

	if (!canRead) return <UnavailableState title="Queue access is restricted" description="Your platform session does not include the super-admin read permission." />
	if (!token) return <UnavailableState title="Platform authentication is required" description="Sign in with an authorized platform operator session to view queue state." />

	return (
		<>
			<PageHeader eyebrow="Platform console / operations" title="Jobs and queues" description="Bounded queue snapshots from the existing platform queue-monitor contract. Job-level inspection and mutations are not exposed without a safe backend contract." actions={<StatusBadge tone="info">Read only</StatusBadge>} />
			{query.isPending ? <div className="h-56 animate-pulse rounded-3xl bg-[var(--muted)]" /> : query.isError ? <UnavailableState title="Queue snapshots unavailable" description={query.error instanceof ApiError && query.error.status === 403 ? "This platform session is not authorized to read queues." : "The queue monitor endpoint could not be reached."} /> : !query.data?.data.length ? <EmptyState title="No queue snapshots" description="The existing queue-monitor API returned no queue records." /> : (
				<section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.03)]">
					<SectionHeader eyebrow="Queue state" title="BullMQ queues" />
					  <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-[var(--border)] text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">{["Queue", "Waiting", "Active", "Delayed", "Failed", "Completed"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead><tbody>{query.data?.data.map((queue) => <tr key={queue.name} className="border-b border-[var(--border)] last:border-0"><th scope="row" className="px-3 py-3 font-medium text-[var(--foreground)]">{queue.name}</th><td className="px-3 py-3 text-[var(--muted-foreground)]">{queue.waiting}</td><td className="px-3 py-3 text-[var(--muted-foreground)]">{queue.active}</td><td className="px-3 py-3 text-[var(--muted-foreground)]">{queue.delayed}</td><td className="px-3 py-3 text-[var(--muted-foreground)]">{queue.failed}</td><td className="px-3 py-3 text-[var(--muted-foreground)]">{queue.completed}</td></tr>)}</tbody></table></div>
				</section>
			)}
			<section className="mt-6"><UnavailableState title="Job-level operations unavailable" description="The backend does not expose safe bounded job listing, payload inspection, retry, removal, or queue mutation contracts. No operational controls are shown." /></section>
		</>
	)
}
