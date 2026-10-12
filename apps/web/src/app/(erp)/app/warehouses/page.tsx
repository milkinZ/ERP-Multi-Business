"use client"

import React from "react"

import { PageHeader, StatusBadge } from "@/components/data-display/states"
import { WarehouseWorkspace } from "@/features/erp/warehouses/components/warehouse-workspace"

export default function WarehousesPage() {
	return (
		<>
			<PageHeader
				eyebrow="Tenant application / infrastructure"
				title="Warehouses"
				description="Tenant-scoped warehouse locations backed by the authenticated Warehouse API. Stock and movement state remain owned by Inventory."
				actions={<StatusBadge tone="info">Backend-authoritative</StatusBadge>}
			/>
			<WarehouseWorkspace />
		</>
	)
}
