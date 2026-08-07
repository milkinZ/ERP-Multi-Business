import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BaseRepository } from '../../../core/database/repositories/base.repository';
import { PrismaService } from '../../../core/database/prisma.service';
import {
  SubscriptionAggregate,
  SubscriptionStatus,
  PlanType,
} from './subscription.aggregate';

export type SubscriptionRecord = Prisma.SubscriptionGetPayload<{
  include: { plan: true };
}>;

@Injectable()
export class SubscriptionRepository extends BaseRepository {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async findById(
    id: string,
    tenantId: string,
  ): Promise<SubscriptionAggregate | null> {
    const record = await this.prisma.subscription.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { plan: true },
    });

    if (!record) return null;

    return this.toAggregate(record);
  }

  async findByTenantId(
    tenantId: string,
  ): Promise<SubscriptionAggregate | null> {
    const record = await this.prisma.subscription.findFirst({
      where: { tenantId, deletedAt: null },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) return null;

    return this.toAggregate(record);
  }

  async findAll(tenantId: string): Promise<SubscriptionAggregate[]> {
    const records = await this.prisma.subscription.findMany({
      where: { tenantId, deletedAt: null },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.toAggregate(r));
  }

  async save(aggregate: SubscriptionAggregate): Promise<void> {
    const events = aggregate.pullDomainEvents();

    await this.prisma.subscription.upsert({
      where: { id: aggregate.id },
      create: {
        id: aggregate.id,
        tenantId: aggregate.tenantId,
        planId: aggregate.planId,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        status: aggregate.status as any,
        startedAt: aggregate.startedAt,
        endedAt: aggregate.endedAt,
      },
      update: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        status: aggregate.status as any,
        planId: aggregate.planId,
        endedAt: aggregate.endedAt,
      },
    });

    for (const event of events) {
      await this.prisma.outboxEvent.create({
        data: {
          type: event.type,
          payload: JSON.stringify({
            ...event,
            occurredAt: event.occurredAt ?? new Date(),
          }),
          status: 'PENDING',
        },
      });
    }
  }

  private toAggregate(record: SubscriptionRecord): SubscriptionAggregate {
    return SubscriptionAggregate.reconstitute(
      {
        id: record.id,
        tenantId: record.tenantId,
        planId: record.planId,
        status: record.status as SubscriptionStatus,
        startedAt: record.startedAt,
        endedAt: record.endedAt,
        deletedAt: record.deletedAt,
      },
      {
        id: record.plan.id,
        type: record.plan.type as PlanType,
        name: record.plan.name,
        priceCents: record.plan.priceCents,
      },
    );
  }
}
