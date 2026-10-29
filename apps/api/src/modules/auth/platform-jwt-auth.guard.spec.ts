import { UnauthorizedException } from '@nestjs/common';

import { requestContext } from '../../core/request-context/request-context';
import { PlatformJwtAuthGuard } from './platform-jwt-auth.guard';

describe('PlatformJwtAuthGuard', () => {
  it('accepts platform identities and sets platform-only request context', () => {
    const guard = new PlatformJwtAuthGuard();
    const user = {
      scope: 'platform' as const,
      userId: 'platform-identity-a',
      platformIdentityId: 'platform-identity-a',
      permissions: ['super-admin.read'],
    };

    requestContext.run({ tenantId: 'untrusted-tenant' }, () => {
      expect(guard.handleRequest(null, user)).toBe(user);
      expect(requestContext.get()).toMatchObject({
        userId: 'platform-identity-a',
        platformIdentityId: 'platform-identity-a',
        tenantId: undefined,
        outletId: undefined,
      });
    });
  });

  it('rejects tenant identities on platform routes', () => {
    const guard = new PlatformJwtAuthGuard();

    expect(() =>
      guard.handleRequest(null, {
        scope: 'tenant',
        userId: 'user-a',
        tenantId: 'tenant-a',
        roleId: 'role-a',
        permissions: [],
      }),
    ).toThrow(new UnauthorizedException('Platform authentication required'));
  });
});
