import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessType } from '@prisma/client';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';
import {
  BusinessRegistryAggregate,
  BusinessStatus,
} from './domain/business-registry.aggregate';

export type BusinessRegistryQueryOptions = {
  page?: number;
  limit?: number;
  search?: string;
  businessType?: BusinessType;
  status?: string;
  includeArchived?: boolean;
};

@Injectable()
export class BusinessRegistryRepository extends BaseRepository {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async findById(
    id: string,
    tenantId: string,
  ): Promise<BusinessRegistryAggregate | null> {
    // Tenant.id IS the tenantId — Tenant IS the business registry root.
    if (id !== tenantId) return null;

    const record = await this.prisma.tenant.findFirst({
      where: { id },
    });

    if (!record) return null;

    return this.toAggregate(record);
  }

  async findAll(
    tenantId: string,
    options?: BusinessRegistryQueryOptions,
  ): Promise<{ data: BusinessRegistryAggregate[]; total: number }> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const skip = (page - 1) * limit;

    // 1:1 mapping — a tenant has exactly one business registry record.
    const where: Prisma.TenantWhereInput = { id: tenantId };

    if (!options?.includeArchived) {
      where.deletedAt = null;
    }

    if (options?.businessType) {
      where.businessType = options.businessType;
    }

    if (options?.search) {
      where.OR = [{ name: { contains: options.search, mode: 'insensitive' } }];
    }

    const [records, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return {
      data: records.map((r) => this.toAggregate(r)),
      total,
    };
  }

  async save(aggregate: BusinessRegistryAggregate): Promise<void> {
    const events = aggregate.pullDomainEvents();

    await this.prisma.tenant.upsert({
      where: { id: aggregate.id },
      create: {
        id: aggregate.id,
        name: aggregate.name,
        businessType: aggregate.businessType as BusinessType,
        contactEmail: aggregate.contactEmail ?? null,
        contactPhone: aggregate.contactPhone ?? null,
        address: aggregate.address ?? null,
      },
      update: {
        name: aggregate.name,
        businessType: aggregate.businessType as BusinessType,
        contactEmail: aggregate.contactEmail ?? null,
        contactPhone: aggregate.contactPhone ?? null,
        address: aggregate.address ?? null,
        deletedAt: aggregate.deletedAt ?? null,
      },
    });

    // Write events to outbox
    for (const event of events) {
      await this.prisma.outboxEvent.create({
        data: {
          type: event.type,
          tenantId: aggregate.tenantId,
          payload: JSON.stringify({
            ...event,
            occurredAt: event.occurredAt ?? new Date(),
          }),
          status: 'PENDING',
        },
      });
    }
  }

  async softDelete(id: string, tenantId: string): Promise<void> {
    if (id !== tenantId) return;
    await this.prisma.tenant.updateMany({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async hardDelete(id: string, tenantId: string): Promise<void> {
    if (id !== tenantId) return;
    await this.prisma.tenant.deleteMany({
      where: { id },
    });
  }

  private toAggregate(record: {
    id: string;
    name: string;
    businessType: BusinessType;
    contactEmail?: string | null;
    contactPhone?: string | null;
    address?: string | null;
    deletedAt: Date | null;
    createdAt: Date;
  }): BusinessRegistryAggregate {
    return BusinessRegistryAggregate.reconstitute({
      id: record.id,
      tenantId: record.id, // Tenant.id IS the tenantId
      name: record.name,
      businessType: record.businessType,
      contactEmail: record.contactEmail ?? null,
      contactPhone: record.contactPhone ?? null,
      address: record.address ?? null,
      status: record.deletedAt
        ? BusinessStatus.ARCHIVED
        : BusinessStatus.ACTIVE,
      deletedAt: record.deletedAt,
    });
  }
}
