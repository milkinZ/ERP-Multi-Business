import React from "react"

import { UserDetailWorkspace } from "@/features/erp/users/components/user-detail-workspace"

export default async function UserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  return <UserDetailWorkspace userId={userId} />
}