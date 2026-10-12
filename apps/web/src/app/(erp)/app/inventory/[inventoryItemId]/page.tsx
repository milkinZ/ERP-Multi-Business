"use client"

import React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"

import { PageHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { hasPermission } from "@/lib/permissions"
import { getInventoryHistoryForItem, getInventoryItems, inventoryKeys, type InventoryItem } from "@/features/erp/inventory/api/queries"
import { useAuthStore } from "@/stores/auth.store"

export default function InventoryDetailPage() {
  const params = useParams<{ inventoryItemId: string }>()
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
    queryKey: tenantId ? inventoryKeys.itemHistory(tenantId, params.inventoryItemId) : ["inventory-history", "unauthenticated", params.inventoryItemId],
    queryFn: () => getInventoryHistoryForItem(token as string, params.inventoryItemId),
    enabled: Boolean(token && tenantId && canRead && params.inventoryItemId),
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
    return <div className="h-48 animate-pulse rounded-3xl border border-border bg-[var(--panel)]" />
  }

  if (itemsQuery.isError || historyQuery.isError) {
    const message =
      itemsQuery.error instanceof ApiError && itemsQuery.error.status === 403
        ? "Your session is not authorized to view this inventory record."
        : "The inventory detail API could not be reached."

    return <UnavailableState title="Unable to load inventory item" description={message} />
  }

  const item = (itemsQuery.data ?? []).find((entry: InventoryItem) => entry.id === params.inventoryItemId)
  if (!item) {
    return <UnavailableState title="Inventory item not found" description="The API returned no inventory item for this route." />
  }

  const movements = historyQuery.data ?? []

  return (
    <>
      <PageHeader
        eyebrow="Tenant application / stock"
        title={item.name}
        description="Inventory item detail and movement history returned by the backend tenant-scoped API."
        actions={<StatusBadge tone={item.isActive ? "success" : "neutral"}>{item.isActive ? "Active" : "Inactive"}</StatusBadge>}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Code</p>
          <p className="mt-2 font-medium">{item.code}</p>
        </div>
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Type</p>
          <p className="mt-2 font-medium">{item.type}</p>
        </div>
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Unit</p>
          <p className="mt-2 font-medium">{item.unit ?? "—"}</p>
        </div>
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Tenant</p>
          <p className="mt-2 break-all font-medium">{item.tenantId}</p>
        </div>
      </section>

      <section className="mt-6 rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Description</p>
        <p className="mt-3 text-sm leading-7 text-[var(--muted-foreground)]">{item.description || "No description was returned by the backend."}</p>
      </section>

      <section className="mt-6 rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Movement history</p>
        {!movements.length ? (
          <p className="mt-3 text-sm text-[var(--muted-foreground)]">No movement history was returned for this inventory item.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {movements.slice(0, 8).map((movement) => (
              <div key={movement.id} className="rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-[var(--foreground)]">{movement.type}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">{movement.note ?? "No note provided"}</p>
                  </div>
                  <div className="text-right text-xs text-[var(--muted-foreground)]">
                    <p>{new Date(movement.createdAt).toLocaleString()}</p>
                    <p>Qty: {movement.quantity}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Link href="/app/inventory" className="mt-6 inline-flex text-sm font-semibold text-[var(--primary)] hover:underline">
        Back to inventory
      </Link>
    </>
  )
}
