import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import { TenantContextService } from '../tenants/tenant-context.service';
import { OutletsRepository } from './outlets.repository';

@Injectable()
export class OutletsService {
  constructor(
    private prisma: PrismaService,
    private tenantContext: TenantContextService,
    private readonly outletsRepository: OutletsRepository,
  ) {}

  findAll() {
    const tenantId = this.tenantContext.requireTenant();
    return this.outletsRepository.findAll(tenantId);
  }

  findOne(id: string) {
    const tenantId = this.tenantContext.requireTenant();
    return this.outletsRepository.findOne(id, tenantId);
  }

  create(data: { name: string }) {
    const tenantId = this.tenantContext.requireTenant();
    return this.outletsRepository.create({ tenantId, name: data.name });
  }

  update(id: string, data: { name?: string }) {
    const tenantId = this.tenantContext.requireTenant();
    // Enforce tenant isolation at mutation level.
    return this.outletsRepository.update(id, tenantId, data);
  }

  softDelete(id: string) {
    const tenantId = this.tenantContext.requireTenant();
    // Enforce tenant isolation at mutation level.
    return this.outletsRepository.softDelete(id, tenantId);
  }
}
