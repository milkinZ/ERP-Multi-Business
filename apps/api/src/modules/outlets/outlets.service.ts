import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import { TenantContextService } from '../tenants/tenant-context.service';
import {
  OutletsRepository,
  type OutletQueryOptions,
} from './outlets.repository';

@Injectable()
export class OutletsService {
  constructor(
    private prisma: PrismaService,
    private tenantContext: TenantContextService,
    private readonly outletsRepository: OutletsRepository,
  ) {}

  async findAll(options: OutletQueryOptions) {
    const tenantId = this.tenantContext.requireTenant();
    const result = await this.outletsRepository.findAll(tenantId, options);
    return {
      data: result.data,
      pagination: {
        page: options.page,
        limit: options.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / options.limit),
      },
    };
  }

  findOne(id: string) {
    const tenantId = this.tenantContext.requireTenant();
    return this.outletsRepository.findOne(id, tenantId);
  }

  create(data: { name: string }) {
    const tenantId = this.tenantContext.requireTenant();
    return this.outletsRepository
      .create({ tenantId, name: data.name })
      .then((outlet) => ({ ...outlet, isActive: true }));
  }

  update(id: string, data: { name?: string }) {
    const tenantId = this.tenantContext.requireTenant();
    // Enforce tenant isolation at mutation level.
    return this.outletsRepository.update(id, tenantId, data).then((result) => {
      if (result.count !== 1) throw new NotFoundException('Outlet not found');
      return this.outletsRepository.findOne(id, tenantId);
    });
  }

  softDelete(id: string) {
    const tenantId = this.tenantContext.requireTenant();
    // Enforce tenant isolation at mutation level.
    return this.outletsRepository.softDelete(id, tenantId).then((result) => {
      if (result.count !== 1) throw new NotFoundException('Outlet not found');
      return { id, deleted: true };
    });
  }
}
