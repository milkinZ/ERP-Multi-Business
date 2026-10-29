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
import { SubscriptionHistoryQueryDto } from './dto/subscription-history-query.dto';

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly planRepository: PlanRepository,
    private readonly tenantContext: TenantContextService,
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

  async getSubscriptionHistory(id: string, query: SubscriptionHistoryQueryDto) {
    const tenantId = this.tenantContext.requireTenant();
    const subscription = await this.subscriptionRepository.findById(
      id,
      tenantId,
    );
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }
    return this.subscriptionRepository.findHistory(
      id,
      tenantId,
      query.skip,
      query.take,
    );
  }

  async getAllSubscriptions() {
    const tenantId = this.tenantContext.requireTenant();
    const subscriptions = await this.subscriptionRepository.findAll(tenantId);
    return subscriptions.map((s) => s.toJSON());
  }

  async listPlans() {
    const plans = await this.planRepository.findAll();
    return plans.map((plan) => ({
      id: plan.id,
      type: plan.type,
      name: plan.name,
      priceCents: plan.priceCents,
    }));
  }

  async createSubscription(planId: string) {
    const tenantId = this.tenantContext.requireTenant();

    const existing = await this.subscriptionRepository.findByTenantId(tenantId);
    if (existing) {
      throw new ConflictException('Tenant already has a subscription');
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

  async changePlan(subscriptionId: string, planId: string) {
    const subscription = await this.requireCurrentSubscription(subscriptionId);

    if (!subscription.isActive()) {
      throw new BadRequestException(
        'Cannot change plan on a non-active subscription',
      );
    }

    const newPlan = await this.planRepository.findById(planId);
    if (!newPlan) {
      throw new NotFoundException('Plan not found');
    }

    subscription.schedulePlanChange({
      id: newPlan.id,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      type: newPlan.type as any,
      name: newPlan.name,
      priceCents: newPlan.priceCents,
    });

    await this.subscriptionRepository.save(subscription);

    return subscription.toJSON();
  }

  async cancelSubscription(subscriptionId: string, reason?: string) {
    const subscription = await this.requireCurrentSubscription(subscriptionId);

    subscription.cancel(reason);

    await this.subscriptionRepository.save(subscription);

    return subscription.toJSON();
  }

  async suspendSubscription(subscriptionId: string, reason?: string) {
    const subscription = await this.requireCurrentSubscription(subscriptionId);

    subscription.suspend(reason);

    await this.subscriptionRepository.save(subscription);

    return subscription.toJSON();
  }

  async resumeSubscription(subscriptionId: string) {
    const subscription = await this.requireCurrentSubscription(subscriptionId);
    if (!subscription.canActivate()) {
      throw new BadRequestException('Subscription cannot be resumed');
    }
    subscription.activate();
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

  private async requireCurrentSubscription(subscriptionId: string) {
    const tenantId = this.tenantContext.requireTenant();
    const subscription = await this.subscriptionRepository.findById(
      subscriptionId,
      tenantId,
    );
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }
    return subscription;
  }
}
