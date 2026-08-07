import { Injectable, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';
import { PERMISSIONS } from '../permissions';

@Injectable()
export class RBACPermissionsSeeder implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const entries = Object.entries(PERMISSIONS)
      .map(([, code]) => code)
      .filter((v) => typeof v === 'string');

    const targetCodes = entries.filter(
      (c) =>
        c.startsWith('rbac.') ||
        c.startsWith('subscription.') ||
        c.startsWith('plan.') ||
        c.startsWith('invoice.') ||
        c.startsWith('billing.') ||
        c.startsWith('feature-flag.') ||
        c.startsWith('super-admin.'),
    );

    if (!targetCodes.length) return;

    const existing = await this.prisma.permission.findMany({
      where: { code: { in: targetCodes } },
      select: { code: true },
    });
    const existingSet = new Set(existing.map((e) => e.code));

    const toCreate = targetCodes
      .filter((code) => !existingSet.has(code))
      .map((code) => ({
        code,
        name: code,
      }));

    if (!toCreate.length) return;

    await this.prisma.permission.createMany({
      data: toCreate,
      skipDuplicates: true,
    });
  }
}
