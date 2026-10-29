import { useAuthStore } from "@/stores/auth.store";
import type { Session } from "@/lib/auth/session";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:9867";

let refreshPromise: Promise<boolean> | null = null;
let platformRefreshPromise: Promise<boolean> | null = null;

type PlatformAuthSession = {
  accessToken: string;
  session: Session;
};

export function startPlatformLogin() {
  if (typeof window !== "undefined") {
    window.location.assign(`${API_BASE_URL}/auth/platform/oidc/login`);
  }
}

export async function getPlatformAuthSession(): Promise<PlatformAuthSession> {
  const response = await fetch(`${API_BASE_URL}/auth/platform/session`, {
    credentials: "include",
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message
        : "Unable to restore platform session";
    throw new ApiError(response.status, message);
  }

  const result = unwrapResponse<PlatformAuthSession>(body);
  if (!result.accessToken || result.session.scope !== "platform") {
    throw new ApiError(500, "Invalid platform session response");
  }
  return result;
}

export async function getPlatformCsrfToken(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/auth/platform/csrf`, {
    credentials: "include",
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      "Unable to initialize platform CSRF protection",
    );
  }

  const result = unwrapResponse<{ csrfToken: string }>(body);
  if (!result.csrfToken) {
    throw new ApiError(500, "Platform CSRF token was not returned");
  }
  return result.csrfToken;
}

export async function getCsrfToken(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/auth/csrf`, {
    credentials: "include",
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, "Unable to initialize CSRF protection");
  }

  const result = unwrapResponse<{ csrfToken: string }>(body);
  if (!result.csrfToken) {
    throw new ApiError(500, "CSRF token was not returned");
  }

  return result.csrfToken;
}

export async function refreshAccessToken(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const csrfToken = await getCsrfToken();
        const result = await apiRequest<{ accessToken: string }>(
          "/auth/refresh",
          {
            method: "POST",
            body: JSON.stringify({ csrfToken }),
            headers: { "x-csrf-token": csrfToken },
          },
        );

        useAuthStore.getState().setAccessToken(result.accessToken);
        return true;
      } catch {
        useAuthStore.getState().clear();
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }

  return refreshPromise;
}

export async function refreshPlatformAccessToken(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  if (!platformRefreshPromise) {
    platformRefreshPromise = (async () => {
      try {
        const result = await getPlatformAuthSession();
        useAuthStore.getState().setAccessToken(result.accessToken);
        useAuthStore.getState().setSession(result.session);
        return true;
      } catch {
        useAuthStore.getState().clear();
        return false;
      } finally {
        platformRefreshPromise = null;
      }
    })();
  }
  return platformRefreshPromise;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  return request<T>(path, init, true);
}

export async function apiDownload(
  path: string,
  init: RequestInit = {},
): Promise<Blob> {
  return download(path, init, true);
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function request<T>(
  path: string,
  init: RequestInit,
  canRefresh: boolean,
): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  const state = typeof window !== "undefined" ? useAuthStore.getState() : null;
  const accessToken = state?.accessToken;

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  if (
    !headers.has("Content-Type") &&
    !(init.body instanceof FormData) &&
    init.body !== undefined
  ) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

  if (
    canRefresh &&
    response.status === 401 &&
    path !== "/auth/refresh" &&
    path !== "/auth/login" &&
    path !== "/auth/logout" &&
    !path.startsWith("/auth/platform/")
  ) {
    const refreshed =
      state?.session?.scope === "platform"
        ? await refreshPlatformAccessToken()
        : await refreshAccessToken();
    if (refreshed) {
      return request<T>(path, init, false);
    }
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message
        : "Request failed";
    throw new ApiError(response.status, message);
  }

  return unwrapResponse<T>(body);
}

async function download(
  path: string,
  init: RequestInit,
  canRefresh: boolean,
): Promise<Blob> {
  const headers = new Headers(init.headers ?? {});
  const accessToken =
    typeof window !== "undefined" ? useAuthStore.getState().accessToken : null;
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  if (
    canRefresh &&
    response.status === 401 &&
    path !== "/auth/refresh" &&
    !path.startsWith("/auth/platform/")
  ) {
    const scope =
      typeof window !== "undefined"
        ? useAuthStore.getState().session?.scope
        : undefined;
    const refreshed =
      scope === "platform"
        ? await refreshPlatformAccessToken()
        : await refreshAccessToken();
    if (refreshed) return download(path, init, false);
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message
        : "Download request failed";
    throw new ApiError(response.status, message);
  }
  return response.blob();
}

function unwrapResponse<T>(body: unknown): T {
  if (typeof body === "object" && body !== null && "data" in body)
    return (body as { data: T }).data;
  return body as T;
}
