"use client"

import React from "react"
import Link from "next/link"

import { PageHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth.store"

export default function PlatformWorkersPage() {
	const token = useAuthStore((state) => state.accessToken)
	const session = useAuthStore((state) => state.session)
	const canRead = hasPermission(session, "super-admin.read")

	if (!canRead) return <UnavailableState title="Worker access is restricted" description="Your platform session does not include the super-admin read permission." />
	if (!token) return <UnavailableState title="Platform authentication is required" description="Sign in with an authorized platform operator session to view worker information." />

	return (
		<>
			<PageHeader eyebrow="Platform console / runtime" title="Workers" description="Worker identity, heartbeat, startup, and lifecycle state are not persisted or exposed by the current backend." actions={<StatusBadge tone="warning">Unavailable</StatusBadge>} />
			<UnavailableState title="Worker registry unavailable" description="The current infrastructure exposes queue readiness and queue counts, but no safe platform worker registry or heartbeat contract. Worker state is not inferred from queue counts." />
			<section className="mt-6 rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5">
				<p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--primary)]">Supported visibility</p>
				<h2 className="mt-2 text-xl font-semibold text-[var(--foreground)]">Queue health</h2>
				<p className="mt-2 text-sm text-[var(--muted-foreground)]">Current queue counts are available through the accepted Observability contract.</p>
				<Link href="/platform/observability" className="mt-4 inline-flex rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--panel-alt)]">Open observability</Link>
			</section>
		</>
	)
}
