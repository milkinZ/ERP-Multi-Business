import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { BusinessType } from '@prisma/client';

import { BusinessRegistryRepository } from './business-registry.repository';
import { BusinessRegistryAggregate } from './domain/business-registry.aggregate';
import { TenantContextService } from '../tenants/tenant-context.service';

@Injectable()
export class BusinessRegistryService {
  constructor(
    private readonly repository: BusinessRegistryRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async findAll(options?: {
    page?: number;
    limit?: number;
    search?: string;
    businessType?: BusinessType;
    includeArchived?: boolean;
  }) {
    const tenantId = this.tenantContext.requireTenant();
    return this.repository.findAll(tenantId, options);
  }

  async findById(id: string) {
    const tenantId = this.tenantContext.requireTenant();
    const aggregate = await this.repository.findById(id, tenantId);

    if (!aggregate) {
      throw new NotFoundException('Business not found');
    }

    return aggregate.toJSON();
  }

  async create(data: {
    name: string;
    businessType: BusinessType;
    contactEmail?: string | null;
    contactPhone?: string | null;
    address?: string | null;
  }) {
    const tenantId = this.tenantContext.requireTenant();

    // Check existing
    const existing = await this.repository.findById(tenantId, tenantId);
    if (existing && existing.isActive()) {
      throw new ConflictException('Business already exists for this tenant');
    }

    const id = tenantId; // Tenant IS the business registry
    const aggregate = BusinessRegistryAggregate.create({
      id,
      tenantId,
      name: data.name,
      businessType: data.businessType,
      contactEmail: data.contactEmail ?? null,
      contactPhone: data.contactPhone ?? null,
      address: data.address ?? null,
    });

    await this.repository.save(aggregate);

    return aggregate.toJSON();
  }

  async update(
    id: string,
    data: {
      name?: string;
      businessType?: BusinessType;
      contactEmail?: string | null;
      contactPhone?: string | null;
      address?: string | null;
    },
  ) {
    const tenantId = this.tenantContext.requireTenant();
    const aggregate = await this.loadAggregate(id, tenantId);

    aggregate.update({
      name: data.name,
      businessType: data.businessType,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
      address: data.address,
    });

    await this.repository.save(aggregate);

    return aggregate.toJSON();
  }

  async activate(id: string) {
    const tenantId = this.tenantContext.requireTenant();
    const aggregate = await this.loadAggregate(id, tenantId);

    aggregate.activate();
    await this.repository.save(aggregate);

    return aggregate.toJSON();
  }

  async suspend(id: string, reason?: string) {
    const tenantId = this.tenantContext.requireTenant();
    const aggregate = await this.loadAggregate(id, tenantId);

    aggregate.suspend(reason);
    await this.repository.save(aggregate);

    return aggregate.toJSON();
  }

  async archive(id: string) {
    const tenantId = this.tenantContext.requireTenant();
    const aggregate = await this.loadAggregate(id, tenantId);

    aggregate.archive();
    await this.repository.save(aggregate);

    return aggregate.toJSON();
  }

  async restore(id: string) {
    const tenantId = this.tenantContext.requireTenant();
    const aggregate = await this.loadAggregate(id, tenantId);

    aggregate.restore();
    await this.repository.save(aggregate);

    return aggregate.toJSON();
  }

  async changeBusinessType(id: string, newBusinessType: BusinessType) {
    const tenantId = this.tenantContext.requireTenant();
    const aggregate = await this.loadAggregate(id, tenantId);

    aggregate.changeBusinessType(newBusinessType);
    await this.repository.save(aggregate);

    return aggregate.toJSON();
  }

  private async loadAggregate(
    id: string,
    tenantId: string,
  ): Promise<BusinessRegistryAggregate> {
    const aggregate = await this.repository.findById(id, tenantId);

    if (!aggregate) {
      throw new NotFoundException('Business not found');
    }

    return aggregate;
  }
}
