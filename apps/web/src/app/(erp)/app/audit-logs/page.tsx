"use client"

import React from "react"

import { PageHeader } from "@/components/data-display/states"
import { AuditLogWorkspace } from "@/features/erp/audit-logs/components/audit-log-workspace"

export default function AuditLogsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Tenant application / governance"
        title="Audit logs"
        description="Review tenant-scoped activity recorded by the ERP. Platform audit records are available only in the separate platform workspace."
      />
      <AuditLogWorkspace />
    </>
  )
}
