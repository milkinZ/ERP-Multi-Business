import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  getAll() {
    // Permission is global (unique code), but we keep tenantId filtering for future extension.
    // Current schema does not store tenantId on Permission, so return all.
    return this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
  }
}
