import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';
import { TENANT_ASSIGNABLE_PERMISSION_CODES } from '../tenant-permissions';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  getAll() {
    return this.prisma.permission.findMany({
      where: { code: { in: TENANT_ASSIGNABLE_PERMISSION_CODES } },
      orderBy: { code: 'asc' },
    });
  }
}
