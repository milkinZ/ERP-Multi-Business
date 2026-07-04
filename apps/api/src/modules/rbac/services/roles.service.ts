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
    return this.prisma.role.create({
      data: {
        tenantId,
        name: data.name,
        RolePermission: data.permissionCodes?.length
          ? {
              create: data.permissionCodes.map((code) => ({
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

    await this.prisma.role.update({
      where: { id: role.id },
      data: { name: data.name },
    });

    if (data.permissionCodes) {
      await this.prisma.rolePermission.deleteMany({
        where: { roleId: role.id },
      });

      if (data.permissionCodes.length) {
        await this.prisma.rolePermission.createMany({
          data: await Promise.all(
            data.permissionCodes.map(async (code) => {
              const permission = await this.prisma.permission.findUnique({
                where: { code },
                select: { id: true },
              });

              if (!permission) {
                throw new NotFoundException(
                  `Permission not found for code: ${code}`,
                );
              }

              return {
                id: crypto.randomUUID(),
                roleId: role.id,
                permissionId: permission.id,
              };
            }),
          ),
        });
      }
    }

    return this.getById(tenantId, roleId);
  }

  async remove(tenantId: string, roleId: string) {
    const role = await this.getById(tenantId, roleId);

    await this.prisma.rolePermission.deleteMany({
      where: { roleId: role.id },
    });
    await this.prisma.role.delete({ where: { id: role.id } });

    return { id: role.id, deleted: true };
  }
}
