import { apiRequest } from "@/lib/api/client";

export type UserRoleSummary = {
  id: string;
  name: string;
};

export type UserOutletSummary = {
  id: string;
  name: string;
};

export type TenantUser = {
  id: string;
  email: string;
  isActive: boolean;
  roles: UserRoleSummary[];
  outlets: UserOutletSummary[];
  createdAt: string;
  updatedAt: string;
};

export type UserListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  status?: "ACTIVE" | "INACTIVE";
  sortBy?: "email" | "createdAt" | "updatedAt";
  sortOrder?: "asc" | "desc";
};
export type PaginatedUsers = {
  data: TenantUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
export type UserInvitation = {
  id: string;
  email: string;
  status: "PENDING";
  createdAt: string;
  expiresAt: string;
  roles: UserRoleSummary[];
  outlets: UserOutletSummary[];
};
export type PaginatedInvitations = {
  data: UserInvitation[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export const userKeys = {
  all: (tenantId: string) => ["users", tenantId] as const,
  list: (tenantId: string, query: UserListQuery) =>
    ["users", tenantId, "list", query] as const,
  detail: (tenantId: string, userId: string) =>
    ["users", tenantId, userId] as const,
  invitations: (tenantId: string) =>
    ["users", tenantId, "invitations"] as const,
  roles: (tenantId: string, userId: string) =>
    ["users", tenantId, userId, "roles"] as const,
  outlets: (tenantId: string, userId: string) =>
    ["users", tenantId, userId, "outlets"] as const,
};

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

function queryString(query: object) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.size ? `?${params}` : "";
}

export function getUsers(accessToken: string, query: UserListQuery = {}) {
  return apiRequest<PaginatedUsers>(`/users${queryString(query)}`, {
    headers: authHeaders(accessToken),
  });
}

export function getUser(accessToken: string, userId: string) {
  return apiRequest<TenantUser>(`/users/${encodeURIComponent(userId)}`, {
    headers: authHeaders(accessToken),
  });
}

export function getPendingInvitations(accessToken: string) {
  return apiRequest<PaginatedInvitations>("/users/invitations", {
    headers: authHeaders(accessToken),
  });
}

export function createInvitation(
  accessToken: string,
  input: { email: string; roleIds: string[]; outletIds: string[] },
) {
  return apiRequest<UserInvitation>("/users/invitations", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });
}

export function revokeInvitation(accessToken: string, invitationId: string) {
  return apiRequest<{ id: string; revoked: boolean }>(
    `/users/invitations/${encodeURIComponent(invitationId)}`,
    { method: "DELETE", headers: authHeaders(accessToken) },
  );
}

export function setUserStatus(
  accessToken: string,
  userId: string,
  isActive: boolean,
) {
  return apiRequest<{ id: string; isActive: boolean }>(
    `/users/${encodeURIComponent(userId)}/status`,
    {
      method: "PATCH",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ isActive }),
    },
  );
}

export function getUserRoles(accessToken: string, userId: string) {
  return apiRequest<{ roleIds: string[] }>(
    `/users/${encodeURIComponent(userId)}/roles`,
    { headers: authHeaders(accessToken) },
  );
}

export function setUserRoles(
  accessToken: string,
  userId: string,
  roleIds: string[],
) {
  return apiRequest<{ roleIds: string[] }>(
    `/users/${encodeURIComponent(userId)}/roles`,
    {
      method: "PUT",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ roleIds }),
    },
  );
}

export function getUserOutlets(accessToken: string, userId: string) {
  return apiRequest<{ outletIds: string[] }>(
    `/users/${encodeURIComponent(userId)}/outlets`,
    { headers: authHeaders(accessToken) },
  );
}

export function setUserOutlets(
  accessToken: string,
  userId: string,
  outletIds: string[],
) {
  return apiRequest<{ outletIds: string[] }>(
    `/users/${encodeURIComponent(userId)}/outlets`,
    {
      method: "PUT",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ outletIds }),
    },
  );
}
