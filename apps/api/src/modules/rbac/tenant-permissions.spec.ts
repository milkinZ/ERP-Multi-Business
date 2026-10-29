import { PERMISSIONS } from './permissions';
import {
  isPlatformOnlyPermission,
  isTenantAssignablePermission,
  PLATFORM_ONLY_PERMISSION_CODES,
  TENANT_ASSIGNABLE_PERMISSION_CODES,
} from './tenant-permissions';

describe('tenant permission classification', () => {
  it('classifies every permission exactly once', () => {
    const allCodes = Object.values(PERMISSIONS).sort();
    const tenantCodes = [...TENANT_ASSIGNABLE_PERMISSION_CODES].sort();
    const platformCodes = [...PLATFORM_ONLY_PERMISSION_CODES].sort();
    const platformCodeSet = new Set<string>(platformCodes);

    expect(new Set(tenantCodes).size).toBe(tenantCodes.length);
    expect(new Set(platformCodes).size).toBe(platformCodes.length);
    expect(tenantCodes.filter((code) => platformCodeSet.has(code))).toEqual([]);
    expect([...tenantCodes, ...platformCodes].sort()).toEqual(allCodes);
  });

  it('fails closed for platform-only and unrecognized permission codes', () => {
    expect(
      isTenantAssignablePermission(PERMISSIONS.SUPER_ADMIN_MANAGE_SYSTEM),
    ).toBe(false);
    expect(isPlatformOnlyPermission(PERMISSIONS.QUEUE_VIEW)).toBe(true);
    expect(isTenantAssignablePermission('future.privileged.permission')).toBe(
      false,
    );
  });
});
