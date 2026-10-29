import { ConflictException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';
import { UserRolesService } from './user-roles.service';

describe('UserRolesService', () => {
  const userFindFirst = jest.fn();
  const userCount = jest.fn();
  const userRoleFindUnique = jest.fn();
  const userRoleUpdateMany = jest.fn();
  const userRoleCreate = jest.fn();
  const userRoleFindMany = jest.fn();
  const queryRaw = jest.fn();
  const transactionClient = {
    $queryRaw: queryRaw,
    user: { findFirst: userFindFirst, count: userCount },
    userRole: {
      findUnique: userRoleFindUnique,
      updateMany: userRoleUpdateMany,
      create: userRoleCreate,
    },
  };
  const transaction = jest.fn(
    (callback: (client: typeof transactionClient) => Promise<unknown>) =>
      callback(transactionClient),
  );
  const prisma = {
    $transaction: transaction,
    userRole: { findMany: userRoleFindMany },
  } as unknown as PrismaService;
  const rolePolicy = {
    assertCanAssignRoles: jest.fn().mockResolvedValue(undefined),
  };
  const service = new UserRolesService(prisma, rolePolicy as never);

  beforeEach(() => {
    jest.clearAllMocks();
    userFindFirst.mockResolvedValue({ id: 'user-a', isActive: true });
    userCount.mockResolvedValue(1);
    userRoleFindUnique.mockResolvedValue(null);
    userRoleUpdateMany.mockResolvedValue({ count: 0 });
    userRoleCreate.mockResolvedValue({ id: 'assignment-a' });
    userRoleFindMany.mockResolvedValue([]);
    rolePolicy.assertCanAssignRoles.mockResolvedValue(undefined);
  });

  it('validates tenant ownership and atomically replaces user roles', async () => {
    await service.setUserRoles('tenant-a', 'actor-a', 'user-a', [
      'role-a',
      'role-a',
    ]);

    expect(userFindFirst).toHaveBeenCalledWith({
      where: { id: 'user-a', tenantId: 'tenant-a', deletedAt: null },
      select: { id: true, isActive: true },
    });
    expect(rolePolicy.assertCanAssignRoles).toHaveBeenCalledWith(
      'tenant-a',
      'actor-a',
      ['role-a'],
      transactionClient,
    );
    expect(userRoleUpdateMany).toHaveBeenCalledTimes(1);
    expect(userRoleCreate).toHaveBeenCalledWith({
      data: { tenantId: 'tenant-a', userId: 'user-a', roleId: 'role-a' },
    });
    expect(userCount).toHaveBeenCalled();
  });

  it('does not mutate assignments when the target user is outside the tenant', async () => {
    userFindFirst.mockResolvedValue(null);

    await expect(
      service.setUserRoles('tenant-a', 'actor-a', 'user-b', ['role-a']),
    ).rejects.toThrow(new NotFoundException('User not found'));

    expect(userRoleUpdateMany).not.toHaveBeenCalled();
    expect(userRoleCreate).not.toHaveBeenCalled();
  });

  it('retains the requirement that at least one active administrator remains', async () => {
    userCount.mockResolvedValue(0);

    await expect(
      service.setUserRoles('tenant-a', 'actor-a', 'user-a', ['role-a']),
    ).rejects.toThrow(
      new ConflictException(
        'At least one active user administrator must remain assigned',
      ),
    );

    expect(userRoleCreate).toHaveBeenCalled();
  });
});
