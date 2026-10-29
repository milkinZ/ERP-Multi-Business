import { apiRequest } from "@/lib/api/client";

export type TenantSettings = {
  id: string;
  name: string;
  currencyCode: string | null;
};

export function getTenantSettings(accessToken: string, tenantId: string) {
  return apiRequest<TenantSettings>(
    `/tenants/${encodeURIComponent(tenantId)}`,
    { headers: { Authorization: ["Bearer", accessToken].join(" ") } },
  );
}

export function updateTenantSettings(
  accessToken: string,
  tenantId: string,
  input: { currencyCode: string },
) {
  return apiRequest<TenantSettings>(
    `/tenants/${encodeURIComponent(tenantId)}`,
    {
      method: "PUT",
      headers: { Authorization: ["Bearer", accessToken].join(" ") },
      body: JSON.stringify(input),
    },
  );
}

export const tenantSettingsKeys = {
  detail: (tenantId: string) => ["tenant-settings", tenantId] as const,
};
