"use client"

import React from "react"
import { PageHeader, StatusBadge } from "@/components/data-display/states"
import { ProductWorkspace } from "@/features/erp/products/components/product-workspace"

export default function ProductsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Tenant application / catalog"
        title="Products"
        description="Catalog management for the active tenant, including the product records currently exposed by the backend API."
        actions={<StatusBadge tone="info">Catalog scope</StatusBadge>}
      />

      <ProductWorkspace />
    </>
  )
}
