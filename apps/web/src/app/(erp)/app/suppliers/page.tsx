"use client"

import React from "react"

import { PageHeader, StatusBadge } from "@/components/data-display/states"
import { SupplierWorkspace } from "@/features/erp/suppliers/components/supplier-workspace"

export default function SuppliersPage() {
	return (
		<>
			<PageHeader
				eyebrow="Tenant application / master data"
				title="Suppliers"
				description="Tenant-scoped supplier records with the supported create, update, and delete workflows backed by the authenticated Supplier API."
				actions={<StatusBadge tone="info">Backend-authoritative</StatusBadge>}
			/>
			<SupplierWorkspace />
		</>
	)
}
