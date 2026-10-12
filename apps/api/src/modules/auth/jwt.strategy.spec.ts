import { UnauthorizedException } from '@nestjs/common';
import { TenantStatus } from '@prisma/client';

import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy tenant lifecycle', () => {
  const findTenantMock = jest.fn();
  const prisma = {
    tenant: { findUnique: findTenantMock },
  };
  const originalJwtSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
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
    ).resolves.toMatchObject({ userId: 'user-1', tenantId: 'tenant-1' });
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
});
