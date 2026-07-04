import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';

@Injectable()
export class RolePermissionsService {
  constructor(private readonly prisma: PrismaService) {}

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
    roleId: string,
    permissionCodes: string[],
  ) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, tenantId },
    });
    if (!role) throw new NotFoundException('Role not found');

    await this.prisma.rolePermission.deleteMany({ where: { roleId: role.id } });

    if (permissionCodes.length) {
      const permissions = await this.prisma.permission.findMany({
        where: { code: { in: permissionCodes } },
        select: { id: true, code: true },
      });

      const permissionIdByCode = new Map(
        permissions.map((p) => [p.code, p.id]),
      );

      await this.prisma.rolePermission.createMany({
        data: permissionCodes.map((code) => ({
          id: crypto.randomUUID(),
          roleId: role.id,
          permissionId: permissionIdByCode.get(code)!,
        })),
      });
    }

    return this.getRolePermissions(tenantId, roleId);
  }
}
