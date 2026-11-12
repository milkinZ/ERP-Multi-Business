"use client"

import React, { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { EmptyState, SectionHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { ApiError } from "@/lib/api/client"
import { useAuthStore } from "@/stores/auth.store"
import { deleteNotification, getNotificationPreferences, getNotifications, getUnreadCount, markAllNotificationsAsRead, markNotificationAsRead, notificationKeys, updateNotificationPreferences, type NotificationPreference, type NotificationRecord } from "@/features/erp/notifications/api/queries"

const categoryLabels: Record<string, string> = {
  PRODUCTS: "Products",
  ORDERS: "Orders",
  PAYMENTS: "Payments",
  INVENTORY: "Inventory",
  PROCUREMENT: "Procurement",
  KITCHEN: "Kitchen",
  USERS: "Users",
  BUSINESS: "Business",
  FEATURE_FLAGS: "Feature flags",
  SUBSCRIPTIONS: "Subscriptions",
  BILLING: "Billing",
}

function formatTimestamp(value?: string | null) {
  if (!value) return "—"
  return new Date(value).toLocaleString()
}

export function NotificationWorkspace() {
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const tenantId = session?.tenantId
  const queryClient = useQueryClient()
  const [preferenceDraft, setPreferenceDraft] = useState<NotificationPreference[] | null>(null)

  const listQuery = useQuery({
    queryKey: tenantId ? notificationKeys.all(tenantId) : ["notifications", "unauthenticated"],
    queryFn: () => getNotifications(token as string),
    enabled: Boolean(token && tenantId),
    staleTime: 30_000,
  })

  const unreadQuery = useQuery({
    queryKey: tenantId ? notificationKeys.unread(tenantId) : ["notifications", "unauthenticated", "unread"],
    queryFn: () => getUnreadCount(token as string),
    enabled: Boolean(token && tenantId),
    staleTime: 30_000,
  })
  const preferencesQuery = useQuery({
    queryKey: tenantId ? notificationKeys.preferences(tenantId) : ["notifications", "unauthenticated", "preferences"],
    queryFn: () => getNotificationPreferences(token as string),
    enabled: Boolean(token && tenantId),
  })

  const invalidateQueries = async () => {
    if (!tenantId) return
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: notificationKeys.all(tenantId) }),
      queryClient.invalidateQueries({ queryKey: notificationKeys.unread(tenantId) }),
      queryClient.invalidateQueries({ queryKey: notificationKeys.preferences(tenantId) }),
    ])
  }

  const preferencesMutation = useMutation({
    mutationFn: (preferences: NotificationPreference[]) => {
      if (!token) throw new Error("Authentication required")
      return updateNotificationPreferences(token, preferences)
    },
    retry: 0,
    onSuccess: async () => {
      setPreferenceDraft(null)
      await invalidateQueries()
    },
  })

  const markReadMutation = useMutation({
    mutationFn: (notificationId: string) => {
      if (!token) throw new Error("Authentication required")
      return markNotificationAsRead(token, notificationId)
    },
    retry: 0,
    onSuccess: async () => {
      await invalidateQueries()
    },
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => {
      if (!token) throw new Error("Authentication required")
      return markAllNotificationsAsRead(token)
    },
    retry: 0,
    onSuccess: async () => {
      await invalidateQueries()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (notificationId: string) => {
      if (!token) throw new Error("Authentication required")
      return deleteNotification(token, notificationId)
    },
    retry: 0,
    onSuccess: async () => {
      await invalidateQueries()
    },
  })

  if (!token || !tenantId) {
    return <UnavailableState title="Notification access is restricted" description="Sign in to the ERP workspace to view the tenant notification stream." />
  }

  if (listQuery.isError) {
    const message =
      listQuery.error instanceof ApiError && listQuery.error.status === 403
        ? "Your session is not authorized to access notifications."
        : "The Notifications API could not be reached. No notification records are shown."

    return <UnavailableState title="Unable to load notifications" description={message} />
  }

  const notifications = listQuery.data ?? []
  const unreadCount = unreadQuery.data?.unreadCount ?? 0

  return (
    <div className="space-y-6">
      <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SectionHeader eyebrow="User stream" title="Notifications" />
          <StatusBadge tone={unreadCount > 0 ? "warning" : "neutral"}>{unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}</StatusBadge>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending || unreadCount === 0}
            className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--foreground)] transition hover:bg-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {markAllReadMutation.isPending ? "Updating..." : "Mark all read"}
          </button>
        </div>
      </section>

      <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5">
        <SectionHeader eyebrow="Delivery settings" title="Notification preferences" />
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Choose which notification categories you receive in-app and by email.
        </p>
        {preferencesQuery.isError ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Notification preferences could not be loaded.
          </p>
        ) : preferencesQuery.isPending ? (
          <p role="status" className="mt-3 text-sm text-[var(--muted-foreground)]">
            Loading notification preferences...
          </p>
        ) : (
          <>
            <div className="mt-4 divide-y divide-[var(--border)]">
              {(preferenceDraft ?? preferencesQuery.data ?? []).map((preference) => (
                <div key={preference.category} className="flex flex-wrap items-center justify-between gap-4 py-3">
                  <span className="text-sm font-medium text-[var(--foreground)]">
                    {categoryLabels[preference.category] ?? preference.category}
                  </span>
                  <div className="flex gap-5">
                    {(["inApp", "email"] as const).map((channel) => (
                      <label key={channel} className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                        <input
                          type="checkbox"
                          checked={preference[channel]}
                          onChange={(event) => {
                            const current = preferenceDraft ?? preferencesQuery.data ?? []
                            setPreferenceDraft(current.map((item) =>
                              item.category === preference.category
                                ? { ...item, [channel]: event.target.checked }
                                : item,
                            ))
                          }}
                        />
                        {channel === "inApp" ? "In-app" : "Email"}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {preferencesMutation.isError ? (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {preferencesMutation.error instanceof Error
                  ? preferencesMutation.error.message
                  : "Unable to save notification preferences."}
              </p>
            ) : null}
            <button
              type="button"
              disabled={!preferenceDraft || preferencesMutation.isPending}
              onClick={() => preferenceDraft && preferencesMutation.mutate(preferenceDraft)}
              className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {preferencesMutation.isPending ? "Saving..." : "Save preferences"}
            </button>
          </>
        )}
      </section>

      {!notifications.length ? (
        <EmptyState title="No notifications yet" description="The backend returned no tenant-scoped notifications for the current user." />
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onMarkRead={() => markReadMutation.mutate(notification.id)}
              onDelete={() => deleteMutation.mutate(notification.id)}
              isBusy={markReadMutation.isPending || deleteMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function NotificationCard({
  notification,
  onMarkRead,
  onDelete,
  isBusy,
}: {
  notification: NotificationRecord
  onMarkRead: () => void
  onDelete: () => void
  isBusy: boolean
}) {
  const isUnread = !notification.readAt

  return (
    <article className={`rounded-[24px] border p-5 ${isUnread ? "border-[var(--primary)]/30 bg-[var(--panel)]" : "border-[var(--border)] bg-[var(--panel)]/80"}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--primary)]">{notification.type}</span>
            {isUnread ? <StatusBadge tone="warning">Unread</StatusBadge> : <StatusBadge tone="neutral">Read</StatusBadge>}
          </div>

          <h3 className="text-lg font-semibold text-[var(--foreground)]">{notification.title ?? "Notification"}</h3>
          <p className="text-sm leading-6 text-[var(--muted-foreground)]">{notification.message ?? "No message body returned by the backend."}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!isUnread ? null : (
            <button
              type="button"
              onClick={onMarkRead}
              disabled={isBusy}
              className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--foreground)] hover:bg-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Mark read
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={isBusy}
            className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--danger)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--muted-foreground)]">
        <span>Created {formatTimestamp(notification.createdAt)}</span>
        {notification.readAt ? <span>Read {formatTimestamp(notification.readAt)}</span> : null}
      </div>
    </article>
  )
}
