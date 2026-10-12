import React from "react"

import { PageHeader, StatusBadge } from "@/components/data-display/states"
import { UserWorkspace } from "@/features/erp/users/components/user-workspace"

export default function UsersPage() {
  return (
    <>
      <PageHeader
        eyebrow="Tenant application / access"
        title="Users"
        description="Tenant-scoped user identities and current role/outlet assignments returned by the backend."
        actions={<StatusBadge tone="info">Read only</StatusBadge>}
      />
      <UserWorkspace />
    </>
  )
}