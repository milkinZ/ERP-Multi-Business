import React from "react"

import { PageHeader, StatusBadge } from "@/components/data-display/states"
import { OutletWorkspace } from "@/features/erp/outlets/components/outlet-workspace"

export default function OutletsPage() {
	return (
		<>
			<PageHeader eyebrow="Tenant application / operations" title="Outlets" description="Tenant-scoped outlet master data and supported lifecycle operations." actions={<StatusBadge tone="info">Backend-authoritative</StatusBadge>} />
			<OutletWorkspace />
		</>
	)
}
