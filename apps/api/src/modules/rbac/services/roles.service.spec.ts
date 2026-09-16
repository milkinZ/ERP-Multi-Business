import { NotFoundException } from '@nestjs/common';

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
  const prisma = {
    role: { findMany, findFirst, create, updateMany, deleteMany },
    rolePermission: {
      deleteMany: rolePermissionDeleteMany,
      createMany: rolePermissionCreateMany,
    },
    permission: { findUnique: permissionFindUnique },
  } as unknown as PrismaService;
  const service = new RolesService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not update a role outside the authenticated tenant', async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      service.update('tenant-a', 'role-b', { name: 'Changed' }),
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
      });
    updateMany.mockResolvedValue({ count: 1 });

    await service.update('tenant-a', 'role-a', { name: 'Changed' });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'role-a', tenantId: 'tenant-a' },
      data: { name: 'Changed' },
    });
  });

  it('deletes only the tenant-owned role', async () => {
    findFirst.mockResolvedValue({ id: 'role-a', tenantId: 'tenant-a' });
    deleteMany.mockResolvedValue({ count: 1 });

    await service.remove('tenant-a', 'role-a');

    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: 'role-a', tenantId: 'tenant-a' },
    });
  });
});
