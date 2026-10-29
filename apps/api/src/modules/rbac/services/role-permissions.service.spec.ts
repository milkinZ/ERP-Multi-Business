import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';
import { RolePermissionsService } from './role-permissions.service';

describe('RolePermissionsService', () => {
  const roleFindFirst = jest.fn();
  const permissionFindMany = jest.fn();
  const rolePermissionFindMany = jest.fn();
  const rolePermissionDeleteMany = jest.fn();
  const rolePermissionCreateMany = jest.fn();
  const transaction = jest.fn(
    (callback: (client: unknown) => Promise<unknown>) =>
      callback({
        rolePermission: {
          deleteMany: rolePermissionDeleteMany,
          createMany: rolePermissionCreateMany,
        },
      }),
  );
  const prisma = {
    role: { findFirst: roleFindFirst },
    permission: { findMany: permissionFindMany },
    rolePermission: { findMany: rolePermissionFindMany },
    $transaction: transaction,
  } as unknown as PrismaService;
  const rolePolicy = {
    assertCanGrantPermissions: jest.fn().mockResolvedValue(undefined),
  } as never;
  const service = new RolePermissionsService(prisma, rolePolicy);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not update permissions on a role outside the tenant', async () => {
    roleFindFirst.mockResolvedValue(null);

    await expect(
      service.setRolePermissions('tenant-a', 'actor-a', 'role-b', [
        'product.read',
      ]),
    ).rejects.toThrow(new NotFoundException('Role not found'));

    expect(permissionFindMany).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects platform-only permissions without mutating tenant roles', async () => {
    roleFindFirst.mockResolvedValue({ id: 'role-a', tenantId: 'tenant-a' });

    await expect(
      service.setRolePermissions('tenant-a', 'actor-a', 'role-a', [
        'super-admin.manage.system',
      ]),
    ).rejects.toThrow(
      new ForbiddenException(
        'Permission code is not assignable to tenant roles',
      ),
    );

    expect(permissionFindMany).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects unclassified permission codes without querying permissions', async () => {
    roleFindFirst.mockResolvedValue({ id: 'role-a', tenantId: 'tenant-a' });

    await expect(
      service.setRolePermissions('tenant-a', 'actor-a', 'role-a', [
        'future.privileged.permission',
      ]),
    ).rejects.toThrow(
      new ForbiddenException(
        'Permission code is not assignable to tenant roles',
      ),
    );

    expect(permissionFindMany).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});
