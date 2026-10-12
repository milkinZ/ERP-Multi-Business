import React from "react"

import { PageHeader, StatusBadge } from "@/components/data-display/states"
import { RoleWorkspace } from "@/features/erp/roles/components/role-workspace"

export default function RolesPage() {
	return (
		<>
			<PageHeader eyebrow="Tenant application / access" title="Roles & Permissions" description="Tenant-owned roles and backend-defined permission assignments." actions={<StatusBadge tone="info">Backend-authoritative</StatusBadge>} />
			<RoleWorkspace />
		</>
	)
}
