import { apiRequest } from "@/lib/api/client"

export type NotificationRecord = {
  id: string
  tenantId: string
  outletId?: string | null
  userId?: string | null
  type: string
  title?: string | null
  message?: string | null
  payload?: Record<string, unknown> | null
  readAt?: string | null
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

export const notificationKeys = {
  all: (tenantId: string) => ["notifications", tenantId] as const,
  unread: (tenantId: string) => ["notifications", tenantId, "unread"] as const,
}

export function getNotifications(accessToken: string) {
  return apiRequest<NotificationRecord[]>("/notifications", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

export function getUnreadCount(accessToken: string) {
  return apiRequest<{ unreadCount: number }>("/notifications/unread/count", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

export function markNotificationAsRead(accessToken: string, notificationId: string) {
  return apiRequest<{ updated: number }>(`/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

export function markAllNotificationsAsRead(accessToken: string) {
  return apiRequest<{ updated: number }>("/notifications/read/all", {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

export function deleteNotification(accessToken: string, notificationId: string) {
  return apiRequest<void>(`/notifications/${encodeURIComponent(notificationId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}
