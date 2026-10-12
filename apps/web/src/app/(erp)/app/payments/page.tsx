"use client"

import React from "react"

import { PageHeader, StatusBadge } from "@/components/data-display/states"
import { PaymentWorkspace } from "@/features/erp/payments/components/payment-workspace"

export default function PaymentsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Tenant application / finance"
        title="Payments"
        description="Tenant-scoped payment records returned by the backend. Payment creation remains order-driven and refund workflows remain unavailable unless the backend explicitly exposes them."
        actions={<StatusBadge tone="info">Backend-authoritative</StatusBadge>}
      />

      <PaymentWorkspace />
    </>
  )
}
