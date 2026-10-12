"use client"

import React from "react"
import { PageHeader, StatusBadge } from "@/components/data-display/states"
import { OrderWorkspace } from "@/features/erp/orders/components/order-workspace"

export default function OrdersPage() {
  return (
    <>
      <PageHeader
        eyebrow="Tenant application / commerce"
        title="Orders"
        description="Operational order tracking for the active tenant, including the available status data currently returned by the backend."
        actions={<StatusBadge tone="success">Live order feed</StatusBadge>}
      />

      <OrderWorkspace />
    </>
  )
}
