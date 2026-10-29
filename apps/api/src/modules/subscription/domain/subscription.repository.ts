import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BaseRepository } from '../../../core/database/repositories/base.repository';
import { PrismaService } from '../../../core/database/prisma.service';
import { requestContext } from '../../../core/request-context/request-context';
import { DOMAIN_EVENTS } from '../../../core/events/domain-events';
import type { DomainEvent } from '../../../core/events/domain-events';
import {
  SubscriptionAggregate,
  SubscriptionStatus,
  PlanType,
} from './subscription.aggregate';

export type SubscriptionRecord = Prisma.SubscriptionGetPayload<{
  include: { plan: true; pendingPlan: true };
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
      include: { plan: true, pendingPlan: true },
    });

    if (!record) return null;

    return this.toAggregate(record);
  }

  async findByTenantId(
    tenantId: string,
  ): Promise<SubscriptionAggregate | null> {
    const record = await this.prisma.subscription.findFirst({
      where: { tenantId, deletedAt: null },
      include: { plan: true, pendingPlan: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) return null;

    return this.toAggregate(record);
  }

  async findAll(tenantId: string): Promise<SubscriptionAggregate[]> {
    const records = await this.prisma.subscription.findMany({
      where: { tenantId, deletedAt: null },
      include: { plan: true, pendingPlan: true },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.toAggregate(r));
  }

  async findHistory(
    subscriptionId: string,
    tenantId: string,
    skip: number,
    take: number,
  ) {
    const where = { subscriptionId, tenantId };
    const [data, total] = await Promise.all([
      this.prisma.subscriptionHistory.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
        select: {
          id: true,
          eventType: true,
          actorUserId: true,
          actorType: true,
          metadata: true,
          createdAt: true,
        },
      }),
      this.prisma.subscriptionHistory.count({ where }),
    ]);
    return { data, total, skip, take };
  }

  async save(aggregate: SubscriptionAggregate): Promise<void> {
    const events = aggregate.peekDomainEvents();
    const actorUserId = requestContext.get().userId ?? null;

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.upsert({
        where: { id: aggregate.id },
        create: {
          id: aggregate.id,
          tenantId: aggregate.tenantId,
          planId: aggregate.planId,
          pendingPlanId: aggregate.pendingPlanId,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          status: aggregate.status as any,
          startedAt: aggregate.startedAt,
          endedAt: aggregate.endedAt,
        },
        update: {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          status: aggregate.status as any,
          planId: aggregate.planId,
          pendingPlanId: aggregate.pendingPlanId,
          endedAt: aggregate.endedAt,
        },
      });

      if (events.length > 0) {
        await tx.subscriptionHistory.createMany({
          data: events.map((event) => ({
            subscriptionId: aggregate.id,
            tenantId: aggregate.tenantId,
            eventType: event.type,
            actorUserId,
            actorType: actorUserId ? 'TENANT_USER' : 'SYSTEM',
            metadata: this.toSafeHistoryMetadata(event),
            ...(event.occurredAt ? { createdAt: event.occurredAt } : {}),
          })),
        });
      }

      for (const event of events) {
        await tx.outboxEvent.create({
          data: {
            tenantId: aggregate.tenantId,
            type: event.type,
            payload: JSON.stringify({
              ...event,
              occurredAt: event.occurredAt ?? new Date(),
            }),
            status: 'PENDING',
          },
        });
      }
    });

    aggregate.pullDomainEvents();
  }

  private toSafeHistoryMetadata(event: DomainEvent): Prisma.InputJsonObject {
    switch (event.type) {
      case DOMAIN_EVENTS.SUBSCRIPTION_CREATED:
      case DOMAIN_EVENTS.SUBSCRIPTION_ACTIVATED:
        return { planType: event.payload.planType };
      case DOMAIN_EVENTS.SUBSCRIPTION_RENEWED:
        return {
          planType: event.payload.planType,
          billingPeriodStart: event.payload.billingPeriodStart,
          billingPeriodEnd: event.payload.billingPeriodEnd,
        };
      case DOMAIN_EVENTS.SUBSCRIPTION_PLAN_CHANGED:
        return {
          oldPlanType: event.payload.oldPlanType,
          newPlanType: event.payload.newPlanType,
        };
      case DOMAIN_EVENTS.SUBSCRIPTION_PLAN_CHANGE_SCHEDULED:
        return {
          currentPlanId: event.payload.currentPlanId,
          previousPendingPlanId: event.payload.previousPendingPlanId,
          pendingPlanId: event.payload.pendingPlanId,
          effectiveAt: event.payload.effectiveAt,
        };
      case DOMAIN_EVENTS.SUBSCRIPTION_PAST_DUE:
        return { dueAmountCents: event.payload.dueAmountCents };
      default:
        return {};
    }
  }

  private toAggregate(record: SubscriptionRecord): SubscriptionAggregate {
    if (record.pendingPlanId && !record.pendingPlan) {
      throw new Error(
        `Subscription ${record.id} references missing pending plan ${record.pendingPlanId}`,
      );
    }

    return SubscriptionAggregate.reconstitute(
      {
        id: record.id,
        tenantId: record.tenantId,
        planId: record.planId,
        pendingPlanId: record.pendingPlanId,
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
      record.pendingPlan
        ? {
            id: record.pendingPlan.id,
            type: record.pendingPlan.type as PlanType,
            name: record.pendingPlan.name,
            priceCents: record.pendingPlan.priceCents,
          }
        : null,
    );
  }
}
