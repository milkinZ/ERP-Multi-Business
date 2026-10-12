"use client"

import React from "react"

import { PageHeader, StatusBadge } from "@/components/data-display/states"
import { PurchaseOrderWorkspace } from "@/features/erp/purchase-orders/components/purchase-order-workspace"

export default function PurchaseOrdersPage() {
	return (
		<>
			<PageHeader eyebrow="Tenant application / procurement" title="Purchase Orders" description="Supplier orders, backend-authoritative lifecycle state, and transactional receiving through the supported Purchase Order API." actions={<StatusBadge tone="info">Backend-authoritative</StatusBadge>} />
			<PurchaseOrderWorkspace />
		</>
	)
}
