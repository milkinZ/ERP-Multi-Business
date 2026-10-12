"use client"

import React from "react"
import { PageHeader, StatusBadge } from "@/components/data-display/states"
import { NotificationWorkspace } from "@/features/erp/notifications/components/notification-workspace"

export default function NotificationsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Tenant application / communication"
        title="Notifications"
        description="Current user notifications returned by the backend. This screen follows the verified tenant-scoped notification contract and does not invent additional routes or metadata behaviors."
        actions={<StatusBadge tone="info">Verified backend contract</StatusBadge>}
      />

      <NotificationWorkspace />
    </>
  )
}
