export type PlatformAuditLogResponse = {
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
  createdAt: Date;
};
