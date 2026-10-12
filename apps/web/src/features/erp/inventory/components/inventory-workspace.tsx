"use client"

import React from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"

import { EmptyState, SectionHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth.store"
import { getInventoryHistory, getInventoryItems, inventoryKeys, type InventoryItem } from "@/features/erp/inventory/api/queries"
import { InventoryMutationForm } from "@/features/erp/inventory/components/inventory-mutation-form"

function statusTone(item: InventoryItem) {
  return item.isActive ? "success" : "neutral"
}

export function InventoryWorkspace() {
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const tenantId = session?.tenantId
  const canRead = hasPermission(session, "inventory.read")

  const itemsQuery = useQuery({
    queryKey: tenantId ? inventoryKeys.list(tenantId) : ["inventory", "unauthenticated"],
    queryFn: () => getInventoryItems(token as string),
    enabled: Boolean(token && tenantId && canRead),
    staleTime: 15_000,
  })

  const historyQuery = useQuery({
    queryKey: tenantId ? inventoryKeys.history(tenantId) : ["inventory-history", "unauthenticated"],
    queryFn: () => getInventoryHistory(token as string),
    enabled: Boolean(token && tenantId && canRead),
    staleTime: 15_000,
  })

  if (!canRead) {
    return (
      <UnavailableState
        title="Inventory access is restricted"
        description="Your current tenant session does not include the inventory.read permission."
      />
    )
  }

  if (itemsQuery.isPending || historyQuery.isPending) {
    return (
      <div className="space-y-3">
        <div className="h-20 animate-pulse rounded-[24px] bg-[var(--muted)]" />
        <div className="h-64 animate-pulse rounded-[24px] bg-[var(--muted)]" />
      </div>
    )
  }

  if (itemsQuery.isError || historyQuery.isError) {
    const message =
      itemsQuery.error instanceof ApiError && itemsQuery.error.status === 403
        ? "Your session is not authorized to view inventory records."
        : "The Inventory API could not be reached. No stock data is shown."

    return <UnavailableState title="Unable to load inventory" description={message} />
  }

  const items = itemsQuery.data ?? []
  const movements = historyQuery.data ?? []
  const canAdjust = hasPermission(session, "inventory.adjust")

  return (
    <div className="space-y-6">
      {canAdjust ? (
        <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <SectionHeader eyebrow="Inventory mutation" title="Stock operations" />
          <p className="mb-5 text-sm text-[var(--muted-foreground)]">Stock-in, adjustment, and waste are submitted to the backend. Sales and consumption movements remain backend-generated through order fulfillment.</p>
          <InventoryMutationForm items={items} onSaved={() => undefined} />
        </section>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Inventory items</p>
          <p className="mt-3 text-2xl font-semibold text-[var(--foreground)]">{items.length}</p>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">Tenant-scoped inventory API result</p>
        </div>
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Movement events</p>
          <p className="mt-3 text-2xl font-semibold text-[var(--foreground)]">{movements.length}</p>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">Recent backend movement history</p>
        </div>
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Active records</p>
          <p className="mt-3 text-2xl font-semibold text-[var(--foreground)]">{items.filter((item) => item.isActive).length}</p>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">isActive values from backend</p>
        </div>
      </div>

      {!items.length ? (
        <EmptyState title="No inventory items yet" description="This tenant has no inventory records exposed by the current backend contract." />
      ) : (
        <section className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--panel)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--muted)] text-[var(--muted-foreground)]">
                <tr>
                  {['Item', 'Code', 'Type', 'Unit', 'Status'].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em]">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-[var(--border)] transition-colors hover:bg-[var(--muted)]/50">
                    <td className="px-4 py-4">
                      <Link href={`/app/inventory/${item.id}`} className="font-semibold text-[var(--foreground)] hover:text-[var(--primary)]">
                        {item.name}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-[var(--muted-foreground)]">{item.code}</td>
                    <td className="px-4 py-4 font-medium text-[var(--foreground)]">{item.type}</td>
                    <td className="px-4 py-4 text-[var(--muted-foreground)]">{item.unit ?? "—"}</td>
                    <td className="px-4 py-4">
                      <StatusBadge tone={statusTone(item)}>{item.isActive ? "Active" : "Inactive"}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5">
        <SectionHeader eyebrow="Movement history" title="Recent inventory activity" />
        {!movements.length ? (
          <EmptyState title="No movement history yet" description="This tenant has no inventory movement records in the current backend response set." />
        ) : (
          <div className="space-y-3">
            {movements.slice(0, 6).map((movement) => (
              <div key={movement.id} className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-[var(--foreground)]">{movement.InventoryItem?.name ?? movement.inventoryItemId}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {movement.type} · {movement.quantity} · {movement.Warehouse?.name ?? movement.warehouseId ?? "No warehouse"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[var(--muted-foreground)]">{new Date(movement.createdAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
