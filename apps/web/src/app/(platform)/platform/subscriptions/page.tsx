"use client"

import React from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"

import { EmptyState, PageHeader, SectionHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { hasPermission } from "@/lib/permissions"
import { getPlatformSubscriptions, type PlatformSubscription } from "@/features/platform/api/queries"
import { useAuthStore } from "@/stores/auth.store"

function statusTone(status: string) {
	if (status === "ACTIVE") return "success" as const
	if (status === "PAST_DUE" || status === "SUSPENDED" || status === "TRIAL") return "warning" as const
	if (status === "CANCELLED" || status === "EXPIRED") return "danger" as const
	return "neutral" as const
}

function SubscriptionRow({ subscription }: { subscription: PlatformSubscription }) {
	return (
		<article className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel-alt)] p-4 sm:flex-row sm:items-center sm:justify-between">
			<div className="min-w-0">
				<Link href={`/platform/subscriptions/${encodeURIComponent(subscription.id)}`} className="font-medium text-[var(--foreground)] hover:text-[var(--primary)]">
					{subscription.tenant.name}
				</Link>
				<p className="mt-1 break-all text-xs text-[var(--muted-foreground)]">{subscription.id} · {subscription.tenantId}</p>
			</div>
			<div className="flex items-center gap-3">
				<span className="text-sm text-[var(--foreground)]">{subscription.plan.name}</span>
				<StatusBadge tone={statusTone(subscription.status)}>{subscription.status}</StatusBadge>
			</div>
		</article>
	)
}

export default function SubscriptionsPage() {
	const token = useAuthStore((state) => state.accessToken)
	const session = useAuthStore((state) => state.session)
	const canRead = hasPermission(session, "super-admin.read")
	const query = useQuery({
		queryKey: ["platform-subscriptions"],
		queryFn: () => getPlatformSubscriptions(token as string),
		enabled: Boolean(token && canRead),
	})

	if (!canRead) return <UnavailableState title="Subscription access is restricted" description="Your platform session does not include the super-admin read permission." />
	if (!token) return <UnavailableState title="Platform authentication is required" description="Sign in with an authorized platform operator session to view subscriptions." />

	return (
		<>
			<PageHeader eyebrow="Platform console / commercial control" title="Subscriptions" description="Backend-authoritative tenant subscription records and supported plan changes." actions={<StatusBadge tone="info">Platform scope</StatusBadge>} />
			{query.isPending ? <div className="h-56 animate-pulse rounded-3xl bg-[var(--muted)]" /> : query.isError ? (
				<UnavailableState title="Unable to load subscriptions" description={query.error instanceof ApiError && query.error.status === 403 ? "This platform session is not authorized to read subscriptions." : "The platform subscription API could not be reached."} />
			) : !query.data?.length ? <EmptyState title="No subscriptions found" description="The platform API returned an empty subscription collection." /> : (
				<section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.03)]">
					<SectionHeader eyebrow="Directory" title="Tenant subscriptions" />
					<div className="mt-4 space-y-3">{query.data.map((subscription) => <SubscriptionRow key={subscription.id} subscription={subscription} />)}</div>
				</section>
			)}
		</>
	)
}
