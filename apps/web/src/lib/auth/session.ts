import { apiRequest } from "@/lib/api/client";

export type Session = {
  scope: "tenant" | "platform";
  userId: string;
  tenantId?: string;
  roleId?: string;
  outletId?: string | null;
  platformIdentityId?: string;
  role?: string;
  permissions: string[];
};

export type AccessibleOutlet = { id: string; name: string };

function authHeaders(accessToken: string) {
  return { Authorization: ["Bearer", accessToken].join(" ") };
}

export function getSession(accessToken?: string | null) {
  const headers = accessToken ? authHeaders(accessToken) : undefined;
  return apiRequest<Session>("/auth/me", { headers });
}

export function getAccessibleOutlets(accessToken: string) {
  return apiRequest<AccessibleOutlet[]>("/auth/outlets", {
    headers: authHeaders(accessToken),
  });
}

export function switchActiveOutlet(
  accessToken: string,
  outletId: string,
  csrfToken: string,
) {
  return apiRequest<{ accessToken: string }>("/auth/outlet/switch", {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "x-csrf-token": csrfToken,
    },
    body: JSON.stringify({ outletId, csrfToken }),
  });
}
