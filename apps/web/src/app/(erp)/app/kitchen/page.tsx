"use client"

import React from "react"

import { PageHeader, StatusBadge } from "@/components/data-display/states"
import { KitchenWorkspace } from "@/features/erp/kitchen/components/kitchen-workspace"

export default function KitchenPage() {
	return (
		<>
			<PageHeader
				eyebrow="Tenant application / operations"
				title="Kitchen"
				description="Tenant-scoped Kitchen queue and supported order-status actions. Inventory consumption remains owned by backend fulfillment workflows."
				actions={<StatusBadge tone="info">Backend-authoritative</StatusBadge>}
			/>
			<KitchenWorkspace />
		</>
	)
}
