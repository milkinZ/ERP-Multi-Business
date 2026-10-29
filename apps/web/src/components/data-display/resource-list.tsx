"use client"

import React from "react"
import { useQuery } from "@tanstack/react-query"
import { EmptyState, StatusBadge } from "@/components/data-display/states"
import { useAuthStore } from "@/stores/auth.store"
import type { InventoryItem } from "@/features/erp/inventory/api/queries"
import type { Product } from "@/features/erp/products/api/queries"
import type { SalesOrder } from "@/features/erp/orders/api/queries"
import { getAllInventoryItems } from "@/features/erp/inventory/api/queries"
import { getOrders } from "@/features/erp/orders/api/queries"
import { getProducts } from "@/features/erp/products/api/queries"

type Resource = Product | SalesOrder | InventoryItem

function formatCurrency(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
}

function statusTone(status?: string) {
  const normalized = (status ?? "").toLowerCase()
  if (["completed", "paid", "fulfilled", "healthy", "available", "in stock", "ready"].some((value) => normalized.includes(value))) return "success"
  if (["pending", "processing", "on hold", "partial"].some((value) => normalized.includes(value))) return "warning"
  if (["failed", "cancelled", "blocked", "error", "out of stock"].some((value) => normalized.includes(value))) return "danger"
  if (["active", "queued", "scheduled", "open"].some((value) => normalized.includes(value))) return "info"
  return "neutral"
}

export function ResourceList({ kind }: { kind: "products" | "orders" | "inventory" }) {
  const token = useAuthStore((state) => state.accessToken)
  const query = useQuery<Resource[]>({
    queryKey: [kind],
    queryFn: async () => {
      if (kind === "products") return getProducts(token as string)
      if (kind === "orders") return getOrders(token as string)
      return getAllInventoryItems(token as string)
    },
    enabled: Boolean(token),
  })

  if (!token) return <EmptyState title="Authentication required" description="Sign in to load tenant-scoped records." />
  if (query.isPending) return <div className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-6"><div className="h-12 animate-pulse rounded-xl bg-[var(--muted)]" /></div>
  if (query.isError) return <EmptyState title="Unable to load records" description="The API rejected this request or is unavailable. No placeholder data is shown." />
  if (!query.data?.length) return <EmptyState title="No records yet" description="This tenant has no records available for this view." />

  const columns = kind === "products" ? ["Product", "SKU", "Price", "Status"] : kind === "orders" ? ["Order", "Customer", "Total", "Status"] : ["Item", "Code", "Type", "Status"]

  return (
    <div className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--panel)] shadow-[0_10px_30px_rgba(15,23,42,0.03)]">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--muted)] text-[var(--muted-foreground)]">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em]">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {query.data.map((item) => {
              if (kind === "products") {
                const product = item as Product
                return (
                  <tr key={product.id} className="border-t border-[var(--border)] transition-colors hover:bg-[var(--muted)]/50">
                    <td className="px-4 py-4 font-medium text-[var(--foreground)]">{product.name}</td>
                    <td className="px-4 py-4 text-[var(--muted-foreground)]">{product.sku ?? "—"}</td>
                    <td className="px-4 py-4 text-[var(--foreground)]">{formatCurrency(product.price)}</td>
                    <td className="px-4 py-4"><StatusBadge tone={statusTone(product.sku ? "active" : undefined)}>{product.sku ? "Active" : "Catalog"}</StatusBadge></td>
                  </tr>
                )
              }

              if (kind === "orders") {
                const order = item as SalesOrder
                return (
                  <tr key={order.id} className="border-t border-[var(--border)] transition-colors hover:bg-[var(--muted)]/50">
                    <td className="px-4 py-4 font-medium text-[var(--foreground)]">{order.orderNumber ?? order.id}</td>
                    <td className="px-4 py-4 text-[var(--muted-foreground)]">{order.id}</td>
                    <td className="px-4 py-4 text-[var(--foreground)]">{formatCurrency(order.totalAmount)}</td>
                    <td className="px-4 py-4"><StatusBadge tone={statusTone(order.status)}>{order.status ?? "Unknown"}</StatusBadge></td>
                  </tr>
                )
              }

              const inventory = item as InventoryItem
              return (
                <tr key={inventory.id} className="border-t border-[var(--border)] transition-colors hover:bg-[var(--muted)]/50">
                  <td className="px-4 py-4 font-medium text-[var(--foreground)]">{inventory.name}</td>
                  <td className="px-4 py-4 text-[var(--muted-foreground)]">{inventory.code}</td>
                  <td className="px-4 py-4 text-[var(--foreground)]">{inventory.type ?? "General"}</td>
                  <td className="px-4 py-4"><StatusBadge tone={statusTone(inventory.type ? "healthy" : undefined)}>{inventory.type ?? "Available"}</StatusBadge></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
