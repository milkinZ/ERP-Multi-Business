"use client"

import React from "react"

import { PageHeader, StatusBadge } from "@/components/data-display/states"
import { RecipeWorkspace } from "@/features/erp/recipes/components/recipe-workspace"

export default function RecipesPage() {
	return (
		<>
			<PageHeader
				eyebrow="Tenant application / composition"
				title="Recipes"
				description="Product recipes are loaded and created through the backend's product-scoped recipe contract. Inventory consumption remains owned by fulfillment."
				actions={<StatusBadge tone="info">Backend-authoritative</StatusBadge>}
			/>
			<RecipeWorkspace />
		</>
	)
}
