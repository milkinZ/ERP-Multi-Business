import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';

@Injectable()
export class UserOutletsService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserOutlets(tenantId: string, userId: string) {
    const rows = await this.prisma.userOutlet.findMany({
      where: { tenantId, userId, deletedAt: null },
      include: { outlet: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      userId,
      outletIds: rows.map((r) => r.outletId),
      outlets: rows.map((r) => r.outlet),
    };
  }

  async setUserOutlets(tenantId: string, userId: string, outletIds: string[]) {
    const uniqueOutletIds = [...new Set(outletIds)];

    await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findFirst({
        where: { id: userId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!user) throw new NotFoundException('User not found');

      if (uniqueOutletIds.length) {
        const outlets = await transaction.outlet.findMany({
          where: {
            id: { in: uniqueOutletIds },
            tenantId,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (outlets.length !== uniqueOutletIds.length) {
          throw new NotFoundException('One or more outlets not found');
        }
      }

      await transaction.userOutlet.updateMany({
        where: {
          tenantId,
          userId,
          deletedAt: null,
          ...(uniqueOutletIds.length
            ? { outletId: { notIn: uniqueOutletIds } }
            : {}),
        },
        data: { deletedAt: new Date() },
      });

      for (const outletId of uniqueOutletIds) {
        const existing = await transaction.userOutlet.findUnique({
          where: { userId_outletId: { userId, outletId } },
          select: { id: true, tenantId: true },
        });
        if (existing) {
          if (existing.tenantId !== tenantId) {
            throw new NotFoundException('One or more outlets not found');
          }
          await transaction.userOutlet.updateMany({
            where: { id: existing.id, tenantId },
            data: { deletedAt: null },
          });
        } else {
          await transaction.userOutlet.create({
            data: { tenantId, userId, outletId },
          });
        }
      }

      const noLongerAssignedFilter = uniqueOutletIds.length
        ? { outletId: { notIn: uniqueOutletIds } }
        : {};
      await transaction.session.updateMany({
        where: {
          tenantId,
          userId,
          deletedAt: null,
          ...noLongerAssignedFilter,
        },
        data: { outletId: null },
      });
      await transaction.refreshToken.updateMany({
        where: {
          tenantId,
          userId,
          revokedAt: null,
          ...noLongerAssignedFilter,
        },
        data: { outletId: null },
      });
    });

    return this.getUserOutlets(tenantId, userId);
  }
}
