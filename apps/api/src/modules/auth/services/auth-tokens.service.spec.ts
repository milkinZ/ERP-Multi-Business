import { UnauthorizedException } from '@nestjs/common';

import { AuthTokensService } from './auth-tokens.service';

describe('AuthTokensService', () => {
  const userRoleFindMany = jest.fn();
  const jwtService = { signAsync: jest.fn() };
  const prisma = {
    userRole: { findMany: userRoleFindMany },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('includes the primary roleId required by tenant JWT validation', async () => {
    userRoleFindMany.mockResolvedValue([
      {
        id: 'assignment-a',
        roleId: 'role-owner',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        role: {
          RolePermission: [
            { Permission: { code: 'inventory.read' } },
            { Permission: { code: 'super-admin.read' } },
          ],
        },
      },
      {
        id: 'assignment-b',
        roleId: 'role-operator',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        role: {
          RolePermission: [{ Permission: { code: 'order.read' } }],
        },
      },
    ]);
    const service = new AuthTokensService(jwtService as never, prisma as never);

    await expect(
      service.buildAccessPayload({
        userId: 'user-a',
        tenantId: 'tenant-a',
        sessionId: 'session-a',
        outletId: 'outlet-a',
      }),
    ).resolves.toEqual({
      sub: 'user-a',
      scope: 'tenant',
      tenantId: 'tenant-a',
      roleId: 'role-owner',
      sessionId: 'session-a',
      permissions: ['inventory.read', 'order.read'],
      roles: ['role-owner', 'role-operator'],
      outlets: ['outlet-a'],
    });
    expect(userRoleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-a', tenantId: 'tenant-a', deletedAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('does not issue a tenant token without an assigned role', async () => {
    userRoleFindMany.mockResolvedValue([]);
    const service = new AuthTokensService(jwtService as never, prisma as never);

    await expect(
      service.buildAccessPayload({
        userId: 'user-a',
        tenantId: 'tenant-a',
        sessionId: 'session-a',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
