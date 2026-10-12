"use client"

import React from "react"

import { PageHeader, StatusBadge } from "@/components/data-display/states"
import { IngredientWorkspace } from "@/features/erp/ingredients/components/ingredient-workspace"

export default function IngredientsPage() {
	return (
		<>
			<PageHeader
				eyebrow="Tenant application / master data"
				title="Ingredients"
				description="Tenant-scoped ingredient records and the supported creation workflow backed by the authenticated Ingredients API."
				actions={<StatusBadge tone="info">Backend-authoritative</StatusBadge>}
			/>
			<IngredientWorkspace />
		</>
	)
}
