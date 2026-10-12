import React from "react"

import { PageHeader, StatusBadge } from "@/components/data-display/states"
import { BillingWorkspace } from "@/features/erp/billing/components/billing-workspace"

export default function BillingPage() {
	return (
		<>
			<PageHeader
				eyebrow="Tenant application / finance"
				title="Billing"
				description="Tenant-scoped invoice records and the billing actions explicitly exposed by the backend contract."
				actions={<StatusBadge tone="info">Backend-authoritative</StatusBadge>}
			/>
			<BillingWorkspace />
		</>
	)
}
