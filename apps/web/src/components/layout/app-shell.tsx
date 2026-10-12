"use client"

import type { ReactNode } from "react"
import React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, LogOut } from "lucide-react"
import { navigationFor, type Surface } from "@/components/navigation/navigation"
import { getUnreadCount, notificationKeys } from "@/features/erp/notifications/api/queries"
import { apiRequest, getCsrfToken } from "@/lib/api/client"
import { useAuthStore } from "@/stores/auth.store"
import { canAccessPlatform } from "@/lib/permissions"

export function AppShell({ surface, children }: { surface: Surface; children: ReactNode }) {
  const items = navigationFor(surface)
  const isPlatform = surface === "platform"
  const router = useRouter()
  const queryClient = useQueryClient()
  const clear = useAuthStore((state) => state.clear)
  const accessToken = useAuthStore((state) => state.accessToken)
  const tenantId = useAuthStore((state) => state.session?.tenantId)
  const userId = useAuthStore((state) => state.session?.userId)
  const session = useAuthStore((state) => state.session)
  const unreadQuery = useQuery({
    queryKey: tenantId && !isPlatform ? notificationKeys.unread(tenantId) : ["notifications", "skip"],
    queryFn: () => getUnreadCount(accessToken as string),
    enabled: Boolean(!isPlatform && accessToken && tenantId),
    staleTime: 30_000,
  })

  const unreadCount = unreadQuery.data?.unreadCount ?? 0

  async function handleSignOut() {
    try {
      const csrfToken = await getCsrfToken()
      await apiRequest("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ csrfToken }),
        headers: { "x-csrf-token": csrfToken },
      })
    } catch {
      // Ignore backend logout failures and keep the UI sign-out flow resilient.
    }

    clear()
    queryClient.clear()
    router.push("/login")
  }

  return (
    <div className="min-h-screen bg-[var(--background)] lg:flex">
      <aside
        className={`w-full border-b border-[var(--border)] bg-[var(--panel)]/95 backdrop-blur-sm lg:min-h-screen lg:w-80 lg:border-b-0 lg:border-r ${isPlatform ? "shadow-[inset_-1px_0_0_rgba(15,23,42,0.06)]" : "shadow-[inset_-1px_0_0_rgba(29,78,216,0.08)]"
          }`}
      >
        <div className="px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-[10px] font-bold tracking-[0.18em] ${isPlatform ? "bg-[var(--platform-soft)] text-[var(--platform)]" : "bg-[var(--muted)] text-[var(--primary)]"}`}>
                {isPlatform ? "PL" : "ERP"}
              </span>
              <Link href={isPlatform ? "/platform/dashboard" : "/app/dashboard"} className="text-lg font-bold tracking-tight text-[var(--foreground)]">
                {isPlatform ? "CONTROL ROOM" : "ERP OPERATIONS"}
              </Link>
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
              {isPlatform ? "platform" : "tenant"}
            </span>
          </div>

          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--muted)]/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Workspace</span>
              <span className={`rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] ${isPlatform ? "bg-[var(--platform-soft)] text-[var(--platform)]" : "bg-[var(--primary)]/10 text-[var(--primary)]"}`}>
                {isPlatform ? "Platform" : "ERP"}
              </span>
            </div>
            <p className="mt-3 truncate text-sm font-semibold text-[var(--foreground)]">{userId ?? "Signed in user"}</p>
            <p className="mt-1 truncate text-xs text-[var(--muted-foreground)]">{tenantId ? `Tenant: ${tenantId}` : "Tenant scope not loaded"}</p>
          </div>
        </div>

        <nav aria-label={`${surface} navigation`} className="grid grid-cols-2 gap-2 px-4 pb-5 sm:grid-cols-3 lg:block lg:space-y-1.5">
          {items.map((item) => {
            const isNotificationsItem = item.href === "/app/notifications"
            const showUnreadBadge = !isPlatform && isNotificationsItem && unreadCount > 0

            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--muted-foreground)] transition-all hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              >
                <span>{item.label}</span>
                {showUnreadBadge ? (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--warning-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--warning)]">
                    {unreadCount}
                  </span>
                ) : null}
              </Link>
            )
          })}
        </nav>

        <div className="flex gap-3 border-t border-[var(--border)] px-6 py-4 text-xs text-[var(--muted-foreground)] lg:mt-6">
          <button type="button" onClick={handleSignOut} className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-[var(--muted)] hover:text-[var(--foreground)]">
            <LogOut size={14} />
            Sign out
          </button>
          {isPlatform ? (
            <Link href="/app/dashboard" className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-[var(--muted)] hover:text-[var(--foreground)]">
              <ArrowLeft size={14} />
              ERP
            </Link>
          ) : canAccessPlatform(session) && (
            <Link href="/platform/dashboard" className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-[var(--muted)] hover:text-[var(--foreground)]">
              <ArrowLeft size={14} />
              Platform
            </Link>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-5 sm:p-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  )
}
