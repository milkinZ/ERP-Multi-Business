import { apiRequest } from "@/lib/api/client"

export type NotificationRecord = {
  id: string
  tenantId: string
  outletId?: string | null
  userId?: string | null
  category?: string | null
  sourceEventId?: string | null
  type: string
  title?: string | null
  message?: string | null
  payload?: Record<string, unknown> | null
  readAt?: string | null
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

export type NotificationPreference = {
  category: string
  inApp: boolean
  email: boolean
}

export const notificationKeys = {
  all: (tenantId: string) => ["notifications", tenantId] as const,
  unread: (tenantId: string) => ["notifications", tenantId, "unread"] as const,
  preferences: (tenantId: string) =>
    ["notifications", tenantId, "preferences"] as const,
}

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` }
}

export function getNotifications(accessToken: string) {
  return apiRequest<{ data: NotificationRecord[]; pagination: unknown }>(
    "/notifications",
    { headers: authHeaders(accessToken) },
  ).then((result) => result.data)
}

export function getUnreadCount(accessToken: string) {
  return apiRequest<{ unreadCount: number }>("/notifications/unread/count", {
    headers: authHeaders(accessToken),
  })
}

export function markNotificationAsRead(
  accessToken: string,
  notificationId: string,
) {
  return apiRequest<{ updated: number }>(
    `/notifications/${encodeURIComponent(notificationId)}/read`,
    {
      method: "PUT",
      headers: authHeaders(accessToken),
    },
  )
}

export function markAllNotificationsAsRead(accessToken: string) {
  return apiRequest<{ updated: number }>("/notifications/read/all", {
    method: "PUT",
    headers: authHeaders(accessToken),
  })
}

export function deleteNotification(accessToken: string, notificationId: string) {
  return apiRequest<{ deleted: boolean }>(
    `/notifications/${encodeURIComponent(notificationId)}`,
    {
      method: "DELETE",
      headers: authHeaders(accessToken),
    },
  )
}

export function getNotificationPreferences(accessToken: string) {
  return apiRequest<NotificationPreference[]>("/notifications/preferences", {
    headers: authHeaders(accessToken),
  })
}

export function updateNotificationPreferences(
  accessToken: string,
  preferences: NotificationPreference[],
) {
  return apiRequest<NotificationPreference[]>("/notifications/preferences", {
    method: "PUT",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ preferences }),
  })
}
