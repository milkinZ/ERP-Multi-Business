import React from "react"

import { RoleDetailWorkspace } from "@/features/erp/roles/components/role-detail-workspace"

export default async function RoleDetailPage({ params }: { params: Promise<{ roleId: string }> }) {
  const { roleId } = await params
  return <RoleDetailWorkspace roleId={roleId} />
}