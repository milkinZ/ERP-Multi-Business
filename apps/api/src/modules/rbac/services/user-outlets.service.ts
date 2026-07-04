import { Injectable } from '@nestjs/common';

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
    await this.prisma.userOutlet.updateMany({
      where: { tenantId, userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (outletIds.length) {
      await this.prisma.userOutlet.createMany({
        data: outletIds.map((outletId) => ({
          tenantId,
          userId,
          outletId,
          deletedAt: null,
        })),
      });
    }

    return this.getUserOutlets(tenantId, userId);
  }
}
