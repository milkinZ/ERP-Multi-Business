import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';
import { isTenantAssignablePermission } from '../tenant-permissions';
import { TenantRolePolicyService } from './tenant-role-policy.service';

@Injectable()
export class RolePermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolePolicy: TenantRolePolicyService,
  ) {}

  async getRolePermissions(tenantId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, tenantId },
    });
    if (!role) throw new NotFoundException('Role not found');

    const rows = await this.prisma.rolePermission.findMany({
      where: { roleId: role.id },
      include: { Permission: true },
    });

    return {
      roleId: role.id,
      permissionCodes: rows.map((r) => r.Permission.code),
    };
  }

  async setRolePermissions(
    tenantId: string,
    actorUserId: string,
    roleId: string,
    permissionCodes: string[],
  ) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, tenantId },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) {
      throw new ForbiddenException('System role permissions cannot be changed');
    }

    const uniqueCodes = [...new Set(permissionCodes)];
    if (uniqueCodes.some((code) => !isTenantAssignablePermission(code))) {
      throw new ForbiddenException(
        'Permission code is not assignable to tenant roles',
      );
    }

    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: uniqueCodes } },
      select: { id: true, code: true },
    });
    const knownCodes = new Set(
      permissions.map((permission) => permission.code),
    );
    const unknownCode = uniqueCodes.find((code) => !knownCodes.has(code));
    if (unknownCode) {
      throw new NotFoundException(
        `Permission not found for code: ${unknownCode}`,
      );
    }
    await this.rolePolicy.assertCanGrantPermissions(
      tenantId,
      actorUserId,
      uniqueCodes,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (permissions.length) {
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({
            id: crypto.randomUUID(),
            roleId: role.id,
            permissionId: permission.id,
          })),
        });
      }
    });

    return this.getRolePermissions(tenantId, roleId);
  }
}
