"use client";

import React from "react";

import { PageHeader, StatusBadge } from "@/components/data-display/states";
import { WarehouseTransferWorkspace } from "@/features/erp/inventory/components/warehouse-transfer-workspace";

export default function WarehouseTransfersPage() {
  return (
    <>
      <PageHeader
        eyebrow="Tenant application / stock"
        title="Warehouse transfers"
        description="Create a transfer, ship it once source stock is available, then record one or more destination receipts."
        actions={<StatusBadge tone="info">Two-phase</StatusBadge>}
      />
      <WarehouseTransferWorkspace />
    </>
  );
}
