import { BadRequestException, Injectable } from '@nestjs/common';

import { TenantContextService } from './tenant-context.service';
import { TenantsRepository } from './tenants.repository';
import { BusinessRegistryService } from '../business-registry/business-registry.service';

@Injectable()
export class TenantsService {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly tenantsRepository: TenantsRepository,
    private readonly businessRegistry: BusinessRegistryService,
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

  update(
    id: string,
    data: {
      name?: string;
      businessType?: import('@prisma/client').BusinessType;
      currencyCode?: string;
    },
  ) {
    const tenantId = this.tenantContext.requireTenant();
    if (id !== tenantId) {
      throw new BadRequestException('Tenant not found');
    }

    return this.tenantsRepository.update(id, {
      name: data.name,
      businessType: data.businessType ?? null,
      currencyCode: data.currencyCode,
    });
  }

  softDelete(id: string) {
    const tenantId = this.tenantContext.requireTenant();
    if (id !== tenantId) {
      throw new BadRequestException('Tenant not found');
    }

    return this.businessRegistry.archive(id);
  }
}
