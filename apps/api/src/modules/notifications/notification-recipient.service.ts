import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class NotificationRecipientService {
  constructor(private readonly prisma: PrismaService) {}

  async findForOutlet(
    tenantId: string,
    outletId: string,
    requiredPermission: string,
  ): Promise<string[]> {
    const assignments = await this.prisma.userOutlet.findMany({
      where: {
        tenantId,
        outletId,
        deletedAt: null,
        outlet: { tenantId, deletedAt: null },
        user: {
          tenantId,
          isActive: true,
          deletedAt: null,
          UserRole: {
            some: {
              tenantId,
              deletedAt: null,
              role: {
                tenantId,
                RolePermission: {
                  some: { Permission: { code: requiredPermission } },
                },
              },
            },
          },
        },
      },
      select: { userId: true },
      distinct: ['userId'],
    });

    return assignments.map(({ userId }) => userId);
  }

  async findForTenant(
    tenantId: string,
    requiredPermission: string,
  ): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
        deletedAt: null,
        tenantWideNotificationAccess: true,
        UserRole: {
          some: {
            tenantId,
            deletedAt: null,
            role: {
              tenantId,
              RolePermission: {
                some: { Permission: { code: requiredPermission } },
              },
            },
          },
        },
      },
      select: { id: true },
    });

    return users.map(({ id }) => id);
  }
}
