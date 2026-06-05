export interface JwtUser {
  userId: string;
  tenantId: string;
  roleId: string;
  outletId?: string | null;
  permissions: string[];
}
