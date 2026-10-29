export type TenantJwtAccessPayload = {
  sub: string;
  scope: 'tenant';
  tenantId: string;
  roleId: string;
  sessionId: string;
  permissions: string[];
  roles?: string[];
  outlets?: string[];
};

export type PlatformJwtAccessPayload = {
  sub: string;
  scope: 'platform';
  platformSessionId: string;
};

export type JwtAccessPayload =
  | TenantJwtAccessPayload
  | PlatformJwtAccessPayload;
