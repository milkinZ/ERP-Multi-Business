import React from "react"

import { PageHeader, StatusBadge } from "@/components/data-display/states"
import { SubscriptionWorkspace } from "@/features/erp/subscriptions/components/subscription-workspace"

export default function SubscriptionsPage() {
	return (
		<>
			<PageHeader
				eyebrow="Tenant application / account"
				title="Subscription"
				description="Current subscription state returned by the authenticated tenant-scoped backend contract."
				actions={<StatusBadge tone="info">Backend-authoritative</StatusBadge>}
			/>
			<SubscriptionWorkspace />
		</>
	)
}
