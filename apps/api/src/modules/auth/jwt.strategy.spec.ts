import { UnauthorizedException } from '@nestjs/common';
import { PlatformAdminRole, TenantStatus } from '@prisma/client';

import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy tenant lifecycle', () => {
  type PlatformSessionFindArgs = {
    where: {
      id: string;
      identityId: string;
      revokedAt: null;
      expiresAt: { gt: Date };
    };
    select: { id: true };
  };
  const findTenantMock = jest.fn();
  const findUserMock = jest.fn();
  const findPlatformIdentityMock = jest.fn();
  const findPlatformSessionMock = jest.fn<
    Promise<{ id: string } | null>,
    [PlatformSessionFindArgs]
  >();
  const prisma = {
    tenant: { findUnique: findTenantMock },
    user: { findFirst: findUserMock },
    platformIdentity: { findFirst: findPlatformIdentityMock },
    platformSession: { findFirst: findPlatformSessionMock },
  };
  const originalJwtSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    findUserMock.mockResolvedValue({ id: 'user-1' });
  });

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-jwt-secret';
  });

  afterAll(() => {
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  });

  it('accepts authenticated users only for ACTIVE tenants', async () => {
    findTenantMock.mockResolvedValue({ status: TenantStatus.ACTIVE });
    const strategy = new JwtStrategy(prisma as never);

    await expect(
      strategy.validate({
        sub: 'user-1',
        tenantId: 'tenant-1',
        roleId: 'role-1',
        permissions: [],
      }),
    ).resolves.toMatchObject({
      scope: 'tenant',
      userId: 'user-1',
      tenantId: 'tenant-1',
    });
  });

  it.each([TenantStatus.SUSPENDED, TenantStatus.DEACTIVATED])(
    'rejects JWT validation for %s tenants',
    async (status) => {
      findTenantMock.mockResolvedValue({ status });
      const strategy = new JwtStrategy(prisma as never);

      await expect(
        strategy.validate({
          sub: 'user-1',
          tenantId: 'tenant-1',
          roleId: 'role-1',
          permissions: [],
        }),
      ).rejects.toThrow(UnauthorizedException);
    },
  );

  it('accepts platform JWTs only for an active identity and session', async () => {
    findPlatformIdentityMock.mockResolvedValue({
      id: 'platform-identity-1',
      role: PlatformAdminRole.OPERATIONS,
    });
    findPlatformSessionMock.mockResolvedValue({ id: 'platform-session-1' });
    const strategy = new JwtStrategy(prisma as never);

    await expect(
      strategy.validate({
        sub: 'platform-identity-1',
        scope: 'platform',
        platformSessionId: 'platform-session-1',
      }),
    ).resolves.toMatchObject({
      scope: 'platform',
      platformIdentityId: 'platform-identity-1',
      permissions: ['super-admin.read', 'super-admin.manage.tenants'],
    });
    const sessionLookup = findPlatformSessionMock.mock.calls[0]?.[0];
    expect(sessionLookup?.where).toMatchObject({
      id: 'platform-session-1',
      identityId: 'platform-identity-1',
      revokedAt: null,
    });
    expect(sessionLookup?.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(sessionLookup?.select).toEqual({ id: true });
  });

  it('rejects unknown JWT scopes instead of treating them as tenant tokens', async () => {
    const strategy = new JwtStrategy(prisma as never);

    await expect(
      strategy.validate({
        sub: 'user-1',
        scope: 'unknown',
        tenantId: 'tenant-1',
        roleId: 'role-1',
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(findTenantMock).not.toHaveBeenCalled();
  });
});
