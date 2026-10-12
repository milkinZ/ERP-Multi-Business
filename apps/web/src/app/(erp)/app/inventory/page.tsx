"use client"

import React from "react"

import { InventoryWorkspace } from "@/features/erp/inventory/components/inventory-workspace"
import { PageHeader, StatusBadge } from "@/components/data-display/states"

export default function InventoryPage() {
  return (
    <>
      <PageHeader
        eyebrow="Tenant application / stock"
        title="Inventory"
        description="Inventory items, movement history, and supported stock adjustments are backed by the authenticated tenant API. Unsupported reservation and warehouse transfer capability remains intentionally unavailable."
        actions={<StatusBadge tone="info">Backend-authoritative</StatusBadge>}
      />

      <InventoryWorkspace />
    </>
  )
}
