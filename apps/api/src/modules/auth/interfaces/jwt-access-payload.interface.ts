export type JwtAccessPayload = {
  sub: string;
  tenantId: string;
  permissions: string[];
  roles?: string[];
  outlets?: string[];
};
