"use client";

import React from "react";

import { InventoryWorkspace } from "@/features/erp/inventory/components/inventory-workspace";
import { PageHeader, StatusBadge } from "@/components/data-display/states";

export default function InventoryPage() {
  return (
    <>
      <PageHeader
        eyebrow="Tenant application / stock"
        title="Inventory"
        description="Inventory items, movement history, stock adjustments, and two-phase warehouse transfers are backed by the authenticated tenant API."
        actions={<StatusBadge tone="info">Backend-authoritative</StatusBadge>}
      />

      <InventoryWorkspace />
    </>
  );
}
