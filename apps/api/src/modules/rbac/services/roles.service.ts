import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';

import * as crypto from 'node:crypto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  getAll(tenantId: string) {
    return this.prisma.role.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async getById(tenantId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, tenantId },
    });

    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async create(
    tenantId: string,
    data: { name: string; permissionCodes?: string[] },
  ) {
    const permissionCodes = await this.validatePermissionCodes(
      data.permissionCodes,
    );

    return this.prisma.role.create({
      data: {
        tenantId,
        name: data.name,
        RolePermission: permissionCodes.length
          ? {
              create: permissionCodes.map((code) => ({
                id: crypto.randomUUID(),
                Permission: { connect: { code } },
              })),
            }
          : undefined,
      },
    });
  }

  async update(
    tenantId: string,
    roleId: string,
    data: { name: string; permissionCodes?: string[] },
  ) {
    const role = await this.getById(tenantId, roleId);
    const permissionCodes = data.permissionCodes
      ? await this.validatePermissionCodes(data.permissionCodes)
      : undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.role.updateMany({
        where: { id: role.id, tenantId },
        data: { name: data.name },
      });

      if (permissionCodes) {
        await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
        if (permissionCodes.length) {
          const permissions = await tx.permission.findMany({
            where: { code: { in: permissionCodes } },
            select: { id: true },
          });
          await tx.rolePermission.createMany({
            data: permissions.map((permission) => ({
              id: crypto.randomUUID(),
              roleId: role.id,
              permissionId: permission.id,
            })),
          });
        }
      }
    });

    return this.getById(tenantId, roleId);
  }

  private async validatePermissionCodes(codes?: string[]): Promise<string[]> {
    const uniqueCodes = [...new Set(codes ?? [])];
    if (!uniqueCodes.length) return [];

    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: uniqueCodes } },
      select: { code: true },
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
    return uniqueCodes;
  }

  async remove(tenantId: string, roleId: string) {
    const role = await this.getById(tenantId, roleId);

    await this.prisma.rolePermission.deleteMany({
      where: { roleId: role.id },
    });
    await this.prisma.role.deleteMany({
      where: { id: role.id, tenantId },
    });

    return { id: role.id, deleted: true };
  }
}
