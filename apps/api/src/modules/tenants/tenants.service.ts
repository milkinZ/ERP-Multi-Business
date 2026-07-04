import { BadRequestException, Injectable } from '@nestjs/common';

import { TenantContextService } from './tenant-context.service';
import { TenantsRepository } from './tenants.repository';

@Injectable()
export class TenantsService {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly tenantsRepository: TenantsRepository,
  ) {}

  findAll() {
    // Tenant list is typically SUPER_ADMIN only; Phase-9 does not specify roles.
    // We still scope by required tenant context for safety.
    const tenantId = this.tenantContext.requireTenant();
    return this.tenantsRepository.findAll(tenantId);
  }

  findOne(id: string) {
    const tenantId = this.tenantContext.requireTenant();
    if (id !== tenantId) {
      throw new BadRequestException('Tenant not found');
    }

    return this.tenantsRepository.findOne(id);
  }

  create(data: {
    name: string;
    businessType?: import('@prisma/client').BusinessType;
  }) {
    return this.tenantsRepository.create({
      name: data.name,
      businessType: data.businessType ?? null,
    });
  }

  update(
    id: string,
    data: {
      name?: string;
      businessType?: import('@prisma/client').BusinessType;
    },
  ) {
    const tenantId = this.tenantContext.requireTenant();
    if (id !== tenantId) {
      throw new BadRequestException('Tenant not found');
    }

    return this.tenantsRepository.update(id, {
      name: data.name,
      businessType: data.businessType ?? null,
    });
  }

  softDelete(id: string) {
    const tenantId = this.tenantContext.requireTenant();
    if (id !== tenantId) {
      throw new BadRequestException('Tenant not found');
    }

    return this.tenantsRepository.softDelete(id);
  }
}
