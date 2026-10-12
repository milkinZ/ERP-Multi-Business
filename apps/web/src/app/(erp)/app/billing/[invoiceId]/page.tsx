import React from "react"

import { InvoiceDetailWorkspace } from "@/features/erp/billing/components/invoice-detail-workspace"

export default async function InvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params
  return <InvoiceDetailWorkspace invoiceId={invoiceId} />
}