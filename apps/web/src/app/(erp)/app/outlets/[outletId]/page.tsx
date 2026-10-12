import React from "react"

import { OutletDetailWorkspace } from "@/features/erp/outlets/components/outlet-detail-workspace"

export default async function OutletDetailPage({ params }: { params: Promise<{ outletId: string }> }) {
  const { outletId } = await params
  return <OutletDetailWorkspace outletId={outletId} />
}