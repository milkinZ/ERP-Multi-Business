// NOTE: keep this file runtime-agnostic; request typing should remain unknown-based.

export type PermissionsUser = {
  permissions: string[];
};

export function isPermissionsUser(value: unknown): value is PermissionsUser {
  if (!value || typeof value !== 'object') return false;

  const v = value as Record<string, unknown>;
  const perms = v['permissions'];

  if (!Array.isArray(perms)) return false;
  for (const p of perms) {
    if (typeof p !== 'string') return false;
  }

  return true;
}

export function extractUserFromRequest(request: unknown): unknown {
  if (!request || typeof request !== 'object') return undefined;

  const req = request as Record<string, unknown>;
  return req['user'];
}

export function extractUserPermissions(request: unknown): string[] | undefined {
  const user = extractUserFromRequest(request);
  if (!isPermissionsUser(user)) return undefined;
  return user.permissions;
}
