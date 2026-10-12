import { useAuthStore } from "@/stores/auth.store"

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = "ApiError"
  }
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:9867"

let refreshPromise: Promise<boolean> | null = null

export async function getCsrfToken(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/auth/csrf`, {
    credentials: "include",
  })
  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throw new ApiError(response.status, "Unable to initialize CSRF protection")
  }

  const result = unwrapResponse<{ csrfToken: string }>(body)
  if (!result.csrfToken) {
    throw new ApiError(500, "CSRF token was not returned")
  }

  return result.csrfToken
}

export async function refreshAccessToken(): Promise<boolean> {
  if (typeof window === "undefined") return false

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const csrfToken = await getCsrfToken()
        const result = await apiRequest<{ accessToken: string }>("/auth/refresh", {
          method: "POST",
          body: JSON.stringify({ csrfToken }),
          headers: { "x-csrf-token": csrfToken },
        })

        useAuthStore.getState().setAccessToken(result.accessToken)
        return true
      } catch {
        useAuthStore.getState().clear()
        return false
      } finally {
        refreshPromise = null
      }
    })()
  }

  return refreshPromise
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return request<T>(path, init, true)
}

async function request<T>(path: string, init: RequestInit, canRefresh: boolean): Promise<T> {
  const headers = new Headers(init.headers ?? {})
  const state = typeof window !== "undefined" ? useAuthStore.getState() : null
  const accessToken = state?.accessToken

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`)
  }

  if (!headers.has("Content-Type") && !(init.body instanceof FormData) && init.body !== undefined) {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers,
  })

  if (canRefresh && response.status === 401 && path !== "/auth/refresh" && path !== "/auth/login" && path !== "/auth/logout") {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      return request<T>(path, init, false)
    }
  }

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "message" in body && typeof body.message === "string" ? body.message : "Request failed"
    throw new ApiError(response.status, message)
  }

  return unwrapResponse<T>(body)
}

function unwrapResponse<T>(body: unknown): T {
  if (typeof body === "object" && body !== null && "data" in body) return (body as { data: T }).data
  return body as T
}
