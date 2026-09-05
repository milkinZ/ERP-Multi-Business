import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { FeatureFlagAggregate } from './domain/feature-flag.aggregate';

@Injectable()
export class FeatureFlagRepository extends BaseRepository {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async findById(
    id: string,
    tenantId: string,
  ): Promise<FeatureFlagAggregate | null> {
    const record = await this.prisma.featureFlag.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!record) return null;
    return this.toAggregate(record);
  }

  async findByIdIncludingArchived(
    id: string,
    tenantId: string,
  ): Promise<FeatureFlagAggregate | null> {
    const record = await this.prisma.featureFlag.findFirst({
      where: { id, tenantId },
    });
    if (!record) return null;
    return this.toAggregate(record);
  }

  async findByKey(
    key: string,
    tenantId: string,
  ): Promise<FeatureFlagAggregate | null> {
    const record = await this.prisma.featureFlag.findFirst({
      where: { key, tenantId, deletedAt: null },
    });
    if (!record) return null;
    return this.toAggregate(record);
  }

  async findAll(
    tenantId: string,
    options?: {
      page?: number;
      limit?: number;
      search?: string;
      includeArchived?: boolean;
    },
  ): Promise<{ data: FeatureFlagAggregate[]; total: number }> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { tenantId };

    if (!options?.includeArchived) {
      where.deletedAt = null;
    }

    if (options?.search) {
      where.key = { contains: options.search };
    }

    const [records, total] = await Promise.all([
      this.prisma.featureFlag.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.featureFlag.count({ where }),
    ]);

    return {
      data: records.map((r) => this.toAggregate(r)),
      total,
    };
  }

  async save(aggregate: FeatureFlagAggregate): Promise<void> {
    const state = aggregate.getState();

    await this.prisma.featureFlag.upsert({
      where: { id: state.id },
      create: {
        id: state.id,
        tenantId: state.tenantId,
        key: state.key,
        enabled: state.enabled,
        payload: state.payload as Prisma.InputJsonValue,
        deletedAt: state.deletedAt,
      },
      update: {
        enabled: state.enabled,
        payload: state.payload as Prisma.InputJsonValue,
        deletedAt: state.deletedAt,
      },
    });
  }

  async softDelete(id: string, tenantId: string): Promise<void> {
    await this.prisma.featureFlag.updateMany({
      where: { id, tenantId },
      data: { deletedAt: new Date() },
    });
  }

  async hardDelete(id: string, tenantId: string): Promise<void> {
    await this.prisma.featureFlag.deleteMany({
      where: { id, tenantId },
    });
  }

  async existsByKey(key: string, tenantId: string): Promise<boolean> {
    const count = await this.prisma.featureFlag.count({
      where: { key, tenantId, deletedAt: null },
    });
    return count > 0;
  }

  private toAggregate(record: {
    id: string;
    tenantId: string;
    key: string;
    enabled: boolean;
    payload: unknown;
    deletedAt: Date | null;
  }): FeatureFlagAggregate {
    return FeatureFlagAggregate.reconstitute({
      id: record.id,
      key: record.key,
      tenantId: record.tenantId,
      enabled: record.enabled,
      payload: (record.payload as Record<string, unknown>) ?? undefined,
      deletedAt: record.deletedAt,
    });
  }
}
