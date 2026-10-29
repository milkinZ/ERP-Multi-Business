export interface JwtUser {
  scope: 'tenant';
  userId: string;
  tenantId: string;
  roleId: string;
  sessionId: string;
  outletId?: string | null;
  permissions: string[];
}

export interface PlatformJwtUser {
  scope: 'platform';
  userId: string;
  platformIdentityId: string;
  permissions: string[];
}
