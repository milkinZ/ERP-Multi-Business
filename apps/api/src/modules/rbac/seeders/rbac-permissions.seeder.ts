import { Injectable, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';
import { PERMISSIONS } from '../permissions';

@Injectable()
export class RBACPermissionsSeeder implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Permission table is global in schema (no tenantId on Permission model).
    // Seeder inserts missing permission codes.
    const entries = Object.entries(PERMISSIONS)
      .map(([, code]) => code)
      .filter((v) => typeof v === 'string');

    // Only seed RBAC-related permissions (keys start with 'rbac.')
    const rbacCodes = entries.filter((c) => c.startsWith('rbac.'));

    if (!rbacCodes.length) return;

    const existing = await this.prisma.permission.findMany({
      where: { code: { in: rbacCodes } },
      select: { code: true },
    });
    const existingSet = new Set(existing.map((e) => e.code));

    const toCreate = rbacCodes
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
