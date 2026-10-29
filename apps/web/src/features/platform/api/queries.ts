import { apiDownload, apiRequest } from "@/lib/api/client";

export type PlatformTenant = {
  id: string;
  name: string;
  businessType?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type PlatformTenantListResponse = {
  data: PlatformTenant[];
  total: number;
};

export type PlatformSubscription = {
  id: string;
  tenantId: string;
  planId: string;
  pendingPlanId: string | null;
  pendingPlanEffectiveAt: "NEXT_RENEWAL" | null;
  status: string;
  planType: string;
  priceCents: number;
  startedAt: string;
  endedAt: string | null;
  tenant: { id: string; name: string };
  plan: { id: string; type: string; name: string; priceCents: number };
};

export type PlatformPlan = {
  id: string;
  type: string;
  name: string;
  priceCents: number;
};

export type PlatformSetting = {
  key: string;
  label: string;
  value: string;
  version: number;
  updatedAt: string | null;
};

export type PlatformInvoice = {
  id: string;
  tenantId: string;
  subscriptionId: string | null;
  invoiceNumber: string;
  amountCents: number;
  currency: string;
  status: string;
  dueAt: string | null;
  paidAt: string | null;
  createdAt: string;
  tenant: { id: string; name: string };
};

export type PlatformReadinessData = {
  database: { ok: boolean };
  redis: { ok: boolean };
  bullmq: { ok: boolean; status?: string };
};

export type PlatformReadiness = {
  data: PlatformReadinessData;
};

export type PlatformLiveness = {
  success: boolean;
  message: string;
  timestamp: string;
};

export type PlatformQueueSnapshot = {
  name: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
};

export type PlatformQueueSnapshotResponse = {
  data: PlatformQueueSnapshot[];
};

export type PlatformOperationalTelemetry = {
  range: { from: string; to: string };
  retentionDays: number;
  metrics: Array<{
    method: string;
    route: string;
    statusClass: string;
    requestCount: number;
    errorCount: number;
    durationTotalMs: number;
  }>;
  events: Array<{
    id: string;
    level: string;
    eventType: string;
    method: string;
    route: string;
    statusCode: number;
    durationMs: number;
    createdAt: string;
  }>;
};

export type PlatformWorker = {
  id: string;
  workerKey: string;
  name: string;
  hostname: string | null;
  instancePid: number | null;
  version: string | null;
  status: "STARTING" | "ACTIVE" | "DRAINING" | "STOPPED" | "STALE";
  startedAt: string;
  lastHeartbeatAt: string;
  stoppedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlatformJobExecution = {
  id: string;
  queueName: string;
  jobName: string | null;
  workerId: string | null;
  attemptNumber: number;
  status: "ACTIVE" | "RETRYING" | "COMPLETED" | "FAILED";
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  errorCategory: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlatformJobExecutionList = {
  data: PlatformJobExecution[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type PlatformBillingAggregate = {
  tenants: {
    total: number;
    byStatus: Array<{ status: string; count: number }>;
  };
  users: { total: number };
  outlets: { total: number };
  platformAudit: { total: number; last24Hours: number };
  subscriptions: {
    total: number;
    byStatus: Array<{ status: string; count: number }>;
    byPlan: Array<{
      planId: string;
      planType: string;
      planName: string;
      subscriptionCount: number;
    }>;
  };
  invoices: {
    total: number;
    byStatusAndCurrency: Array<{
      status: string;
      currency: string;
      count: number;
      amountCents: number;
    }>;
    byProviderStatus: Array<{
      providerStatus: string | null;
      count: number;
    }>;
  };
  paymentRequests: {
    total: number;
    byState: Array<{ state: string; count: number }>;
  };
};

export type PlatformAuditLog = {
  id: string;
  actorUserId: string;
  actorTenantId: string;
  actorType: string;
  action: string;
  resourceType: string;
  resourceId: string;
  targetTenantId: string | null;
  requestId: string | null;
  correlationId: string | null;
  metadata: Record<string, unknown> | null;
  outcome: string;
  createdAt: string;
};

export type PlatformAuditLogListResponse = {
  data: PlatformAuditLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export const platformObservabilityKeys = {
  all: ["platform-observability"] as const,
  readiness: () => [...platformObservabilityKeys.all, "readiness"] as const,
  liveness: () => [...platformObservabilityKeys.all, "liveness"] as const,
  queues: () => [...platformObservabilityKeys.all, "queues"] as const,
  telemetry: () => [...platformObservabilityKeys.all, "telemetry"] as const,
};

export const platformAuditKeys = {
  all: ["platform-audit-logs"] as const,
  list: (params: { page: number; action?: string; resourceType?: string }) =>
    [...platformAuditKeys.all, "list", params] as const,
  detail: (id: string) => [...platformAuditKeys.all, "detail", id] as const,
};

const authHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
});

export function getPlatformTenants(accessToken: string) {
  return apiRequest<PlatformTenantListResponse>("/super-admin/tenants", {
    headers: authHeaders(accessToken),
  });
}

export function getPlatformTenant(accessToken: string, tenantId: string) {
  return apiRequest<PlatformTenant>(
    `/super-admin/tenants/${encodeURIComponent(tenantId)}`,
    {
      headers: authHeaders(accessToken),
    },
  );
}

export function getPlatformSubscriptions(accessToken: string) {
  return apiRequest<PlatformSubscription[]>("/super-admin/subscriptions", {
    headers: authHeaders(accessToken),
  });
}

export function getPlatformSubscription(
  accessToken: string,
  subscriptionId: string,
) {
  return apiRequest<PlatformSubscription>(
    `/super-admin/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      headers: authHeaders(accessToken),
    },
  );
}

export function getPlatformPlans(accessToken: string) {
  return apiRequest<PlatformPlan[]>("/super-admin/plans", {
    headers: authHeaders(accessToken),
  });
}

export function getPlatformWorkers(accessToken: string) {
  return apiRequest<PlatformWorker[]>("/super-admin/workers", {
    headers: authHeaders(accessToken),
  });
}

export function getPlatformJobExecutions(
  accessToken: string,
  params: {
    page: number;
    limit?: number;
    queueName?: string;
    status?: PlatformJobExecution["status"];
  },
) {
  const search = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit ?? 25),
  });
  if (params.queueName) search.set("queueName", params.queueName);
  if (params.status) search.set("status", params.status);

  return apiRequest<PlatformJobExecutionList>(
    `/super-admin/job-executions?${search.toString()}`,
    {
      headers: authHeaders(accessToken),
    },
  );
}

export function getPlatformBillingAggregate(accessToken: string) {
  return apiRequest<PlatformBillingAggregate>(
    "/super-admin/billing/aggregate",
    {
      headers: authHeaders(accessToken),
    },
  );
}

export function changePlatformSubscriptionPlan(
  accessToken: string,
  tenantId: string,
  planId: string,
) {
  return apiRequest<{
    tenantId: string;
    newPlanId: string;
    pendingPlanId: string | null;
    effectiveAt: "NEXT_RENEWAL";
  }>(`/super-admin/tenants/${encodeURIComponent(tenantId)}/plan`, {
    method: "PUT",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ planId }),
  });
}

export function getPlatformSettings(accessToken: string) {
  return apiRequest<PlatformSetting[]>("/super-admin/settings", {
    headers: authHeaders(accessToken),
  });
}

export function updatePlatformSetting(
  accessToken: string,
  setting: Pick<PlatformSetting, "key" | "value" | "version">,
) {
  return apiRequest<PlatformSetting>(
    `/super-admin/settings/${encodeURIComponent(setting.key)}`,
    {
      method: "PUT",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        value: setting.value,
        expectedVersion: setting.version,
      }),
    },
  );
}

export function getPlatformInvoices(accessToken: string) {
  return apiRequest<PlatformInvoice[]>("/super-admin/invoices", {
    headers: authHeaders(accessToken),
  });
}

export function downloadPlatformInvoices(
  accessToken: string,
  filters: { from?: string; to?: string; status?: string },
) {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.status) params.set("status", filters.status);
  const query = params.size ? `?${params.toString()}` : "";
  return apiDownload(`/super-admin/invoices-export.csv${query}`, {
    headers: authHeaders(accessToken),
  });
}

export function getPlatformInvoice(accessToken: string, invoiceId: string) {
  return apiRequest<PlatformInvoice>(
    `/super-admin/invoices/${encodeURIComponent(invoiceId)}`,
    {
      headers: authHeaders(accessToken),
    },
  );
}

export function activatePlatformTenant(accessToken: string, tenantId: string) {
  return apiRequest<{ tenantId: string; status: string }>(
    `/super-admin/tenants/${encodeURIComponent(tenantId)}/activate`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
    },
  );
}

export function suspendPlatformTenant(
  accessToken: string,
  tenantId: string,
  reason?: string,
) {
  return apiRequest<{ tenantId: string; status: string }>(
    `/super-admin/tenants/${encodeURIComponent(tenantId)}/suspend`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify(reason ? { reason } : {}),
    },
  );
}

export function deactivatePlatformTenant(
  accessToken: string,
  tenantId: string,
  reason?: string,
) {
  return apiRequest<{ tenantId: string; status: string }>(
    `/super-admin/tenants/${encodeURIComponent(tenantId)}`,
    {
      method: "DELETE",
      headers: authHeaders(accessToken),
      body: JSON.stringify(reason ? { reason } : {}),
    },
  );
}

export function restorePlatformTenant(accessToken: string, tenantId: string) {
  return apiRequest<{ tenantId: string; status: string }>(
    `/super-admin/tenants/${encodeURIComponent(tenantId)}/restore`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
    },
  );
}

export function getHealth() {
  return apiRequest<PlatformReadiness>("/health/readiness");
}

export function getLiveness() {
  return apiRequest<PlatformLiveness>("/health/liveness");
}

export function getPlatformQueues(accessToken: string) {
  return apiRequest<PlatformQueueSnapshotResponse>("/admin/queues", {
    headers: authHeaders(accessToken),
  });
}

export function getPlatformOperationalTelemetry(
  accessToken: string,
  range: { from: string; to: string },
) {
  const params = new URLSearchParams(range);
  return apiRequest<PlatformOperationalTelemetry>(
    `/super-admin/operational/telemetry?${params.toString()}`,
    { headers: authHeaders(accessToken) },
  );
}

export function getPlatformAuditLogs(
  accessToken: string,
  params: {
    page: number;
    limit?: number;
    action?: string;
    resourceType?: string;
  },
) {
  const search = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit ?? 20),
  });
  if (params.action) search.set("action", params.action);
  if (params.resourceType) search.set("resourceType", params.resourceType);

  return apiRequest<PlatformAuditLogListResponse>(
    `/super-admin/audit-logs?${search.toString()}`,
    {
      headers: authHeaders(accessToken),
    },
  );
}

export function getPlatformAuditLog(accessToken: string, id: string) {
  return apiRequest<PlatformAuditLog>(
    `/super-admin/audit-logs/${encodeURIComponent(id)}`,
    {
      headers: authHeaders(accessToken),
    },
  );
}
