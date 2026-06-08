export type ApiError = {
  message: string;
  status?: number;
  details?: unknown;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  // fallback for local dev
  'http://localhost:3001';

function buildUrl(path: string) {
  if (!path.startsWith('/')) return `${API_BASE_URL}/${path}`;
  return `${API_BASE_URL}${path}`;
}

async function request<T>(
  path: string,
  options: {
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: unknown;
    token?: string | null;
    signal?: AbortSignal;
    query?: Record<string, string | number | boolean | undefined>;
    headers?: Record<string, string>;
  },
): Promise<T> {
  const url = new URL(buildUrl(path));

  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      if (v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers ?? {}),
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url.toString(), {
    method: options.method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (!res.ok) {
    let details: unknown = undefined;

    try {
      details = (await res.json()) as unknown;
    } catch {
      // ignore
    }

    const err: ApiError = {
      message:
        (details as { message?: string })?.message ??
        (details as { error?: string })?.error ??
        res.statusText ??
        'Request failed',
      status: res.status,
      details,
    };

    throw err;
  }

  // Some endpoints may return empty response
  if (res.status === 204) return undefined as T;

  return (await res.json()) as T;
}

export const apiClient = {
  API_BASE_URL,

  async get<T>(
    path: string,
    args?: {
      token?: string | null;
      query?: Record<string, string | number | boolean | undefined>;
    },
  ) {
    return request<T>(path, {
      method: 'GET',
      token: args?.token ?? null,
      query: args?.query,
    });
  },

  async post<T>(
    path: string,
    body?: unknown,
    args?: {
      token?: string | null;
      query?: Record<string, string | number | boolean | undefined>;
    },
  ) {
    return request<T>(path, {
      method: 'POST',
      token: args?.token ?? null,
      query: args?.query,
      body,
    });
  },

  async patch<T>(
    path: string,
    body?: unknown,
    args?: {
      token?: string | null;
      query?: Record<string, string | number | boolean | undefined>;
    },
  ) {
    return request<T>(path, {
      method: 'PATCH',
      token: args?.token ?? null,
      query: args?.query,
      body,
    });
  },

  async del<T>(path: string, args?: { token?: string | null }) {
    return request<T>(path, {
      method: 'DELETE',
      token: args?.token ?? null,
    });
  },
};

