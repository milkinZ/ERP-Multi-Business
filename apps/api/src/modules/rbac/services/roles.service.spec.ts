import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';
import { RolesService } from './roles.service';

describe('RolesService', () => {
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const create = jest.fn();
  const updateMany = jest.fn();
  const deleteMany = jest.fn();
  const rolePermissionDeleteMany = jest.fn();
  const permissionFindUnique = jest.fn();
  const rolePermissionCreateMany = jest.fn();
  const transaction = jest.fn((callback: (client: unknown) => unknown) =>
    callback({
      role: { updateMany, deleteMany },
      rolePermission: {
        deleteMany: rolePermissionDeleteMany,
        createMany: rolePermissionCreateMany,
      },
      permission: { findMany: jest.fn().mockResolvedValue([]) },
    }),
  );
  const permissionFindMany = jest.fn();
  const prisma = {
    role: { findMany, findFirst, create, updateMany, deleteMany },
    rolePermission: {
      deleteMany: rolePermissionDeleteMany,
      createMany: rolePermissionCreateMany,
    },
    permission: {
      findUnique: permissionFindUnique,
      findMany: permissionFindMany,
    },
    $transaction: transaction,
  } as unknown as PrismaService;
  const rolePolicy = {
    assertCanGrantPermissions: jest.fn().mockResolvedValue(undefined),
  };
  const service = new RolesService(prisma, rolePolicy as never);

  beforeEach(() => {
    jest.clearAllMocks();
    permissionFindMany.mockResolvedValue([]);
  });

  it('does not update a role outside the authenticated tenant', async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      service.update('tenant-a', 'actor-a', 'role-b', { name: 'Changed' }),
    ).rejects.toThrow(new NotFoundException('Role not found'));
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('updates only the tenant-owned role', async () => {
    findFirst
      .mockResolvedValueOnce({ id: 'role-a', tenantId: 'tenant-a' })
      .mockResolvedValueOnce({
        id: 'role-a',
        tenantId: 'tenant-a',
        name: 'Changed',
        description: null,
        isSystem: false,
        systemKey: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { UserRole: 0, RolePermission: 0 },
      });
    updateMany.mockResolvedValue({ count: 1 });

    await service.update('tenant-a', 'actor-a', 'role-a', {
      name: 'Changed',
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'role-a', tenantId: 'tenant-a', isSystem: false },
      data: { name: 'Changed' },
    });
  });

  it('deletes only the tenant-owned role', async () => {
    findFirst
      .mockResolvedValueOnce({
        id: 'role-a',
        tenantId: 'tenant-a',
        isSystem: false,
      })
      .mockResolvedValueOnce(null);
    deleteMany.mockResolvedValue({ count: 1 });

    await service.remove('tenant-a', 'role-a');

    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: 'role-a', tenantId: 'tenant-a', isSystem: false },
    });
  });

  it('rejects platform permissions when creating tenant roles', async () => {
    await expect(
      service.create('tenant-a', 'actor-a', {
        name: 'Platform admin',
        permissionCodes: ['super-admin.manage.system'],
      }),
    ).rejects.toThrow(
      new ForbiddenException(
        'Permission code is not assignable to tenant roles',
      ),
    );

    expect(permissionFindMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects platform permissions when updating tenant roles', async () => {
    findFirst.mockResolvedValue({ id: 'role-a', tenantId: 'tenant-a' });

    await expect(
      service.update('tenant-a', 'actor-a', 'role-a', {
        name: 'Changed',
        permissionCodes: ['feature-flag.manage.global'],
      }),
    ).rejects.toThrow(
      new ForbiddenException(
        'Permission code is not assignable to tenant roles',
      ),
    );

    expect(transaction).not.toHaveBeenCalled();
  });
});
