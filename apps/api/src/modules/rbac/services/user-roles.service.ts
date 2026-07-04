import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';

@Injectable()
export class UserRolesService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserRoles(tenantId: string, userId: string) {
    const userRoles = await this.prisma.userRole.findMany({
      where: { tenantId, userId, deletedAt: null },
      include: { role: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      userId,
      roleIds: userRoles.map((ur) => ur.roleId),
      roles: userRoles.map((ur) => ur.role),
    };
  }

  async setUserRoles(tenantId: string, userId: string, roleIds: string[]) {
    // soft remove existing
    await this.prisma.userRole.updateMany({
      where: { tenantId, userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    // create new
    if (roleIds.length) {
      await this.prisma.userRole.createMany({
        data: roleIds.map((roleId) => ({
          tenantId,
          userId,
          roleId,
          deletedAt: null,
        })),
      });
    }

    return this.getUserRoles(tenantId, userId);
  }
}
