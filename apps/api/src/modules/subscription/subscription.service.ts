import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  SubscriptionAggregate,
  SubscriptionStatus,
} from './domain/subscription.aggregate';

import { SubscriptionRepository } from './domain/subscription.repository';
import { PlanRepository } from './plans/plan.repository';
import { TenantContextService } from '../tenants/tenant-context.service';
import { OutboxPublisher } from '../../infrastructure/events/outbox.publisher';

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly planRepository: PlanRepository,
    private readonly tenantContext: TenantContextService,
    private readonly outbox: OutboxPublisher,
  ) {}

  async getCurrentSubscription() {
    const tenantId = this.tenantContext.requireTenant();
    const subscription =
      await this.subscriptionRepository.findByTenantId(tenantId);

    if (!subscription) {
      throw new NotFoundException(
        'No active subscription found for this tenant',
      );
    }

    return subscription.toJSON();
  }

  async getSubscriptionById(id: string) {
    const tenantId = this.tenantContext.requireTenant();
    const subscription = await this.subscriptionRepository.findById(
      id,
      tenantId,
    );

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    return subscription.toJSON();
  }

  async getAllSubscriptions() {
    const tenantId = this.tenantContext.requireTenant();
    const subscriptions = await this.subscriptionRepository.findAll(tenantId);
    return subscriptions.map((s) => s.toJSON());
  }

  async createSubscription(planId: string) {
    const tenantId = this.tenantContext.requireTenant();

    const existing = await this.subscriptionRepository.findByTenantId(tenantId);
    if (existing && existing.isActive()) {
      throw new ConflictException('Tenant already has an active subscription');
    }

    const plan = await this.planRepository.findById(planId);
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    const subscription = SubscriptionAggregate.create(
      {
        id: crypto.randomUUID(),
        tenantId,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        startedAt: new Date(),
        endedAt: null,
        deletedAt: null,
      },
      {
        id: plan.id,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        type: plan.type as any,
        name: plan.name,
        priceCents: plan.priceCents,
      },
    );

    subscription.activate();

    await this.subscriptionRepository.save(subscription);

    return subscription.toJSON();
  }

  async changePlan(planId: string) {
    const tenantId = this.tenantContext.requireTenant();
    const subscription =
      await this.subscriptionRepository.findByTenantId(tenantId);

    if (!subscription) {
      throw new NotFoundException('No active subscription found');
    }

    if (!subscription.isActive()) {
      throw new BadRequestException(
        'Cannot change plan on a non-active subscription',
      );
    }

    const newPlan = await this.planRepository.findById(planId);
    if (!newPlan) {
      throw new NotFoundException('Plan not found');
    }

    subscription.upgrade({
      id: newPlan.id,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      type: newPlan.type as any,
      name: newPlan.name,
      priceCents: newPlan.priceCents,
    });

    await this.subscriptionRepository.save(subscription);

    return subscription.toJSON();
  }

  async cancelSubscription(reason?: string) {
    const tenantId = this.tenantContext.requireTenant();
    const subscription =
      await this.subscriptionRepository.findByTenantId(tenantId);

    if (!subscription) {
      throw new NotFoundException('No subscription found');
    }

    subscription.cancel(reason);

    await this.subscriptionRepository.save(subscription);

    return subscription.toJSON();
  }

  async suspendSubscription(reason?: string) {
    const tenantId = this.tenantContext.requireTenant();
    const subscription =
      await this.subscriptionRepository.findByTenantId(tenantId);

    if (!subscription) {
      throw new NotFoundException('No subscription found');
    }

    subscription.suspend(reason);

    await this.subscriptionRepository.save(subscription);

    return subscription.toJSON();
  }

  async handleExpiredSubscriptions() {
    const tenantId = this.tenantContext.requireTenant();
    const subscriptions = await this.subscriptionRepository.findAll(tenantId);

    for (const sub of subscriptions) {
      if (sub.isExpired() && sub.status !== SubscriptionStatus.EXPIRED) {
        sub.expire();
        await this.subscriptionRepository.save(sub);
      }
    }
  }

  async getSubscriptionByTenantId(tenantId: string) {
    return this.subscriptionRepository.findByTenantId(tenantId);
  }
}
