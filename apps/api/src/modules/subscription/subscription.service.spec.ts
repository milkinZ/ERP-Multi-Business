import { ConflictException, NotFoundException } from '@nestjs/common';

import {
  PlanType,
  SubscriptionAggregate,
  SubscriptionStatus,
} from './domain/subscription.aggregate';
import { SubscriptionRepository } from './domain/subscription.repository';
import { PlanRepository } from './plans/plan.repository';
import { SubscriptionService } from './subscription.service';
import { TenantContextService } from '../tenants/tenant-context.service';
import { OutboxPublisher } from '../../infrastructure/events/outbox.publisher';

const plan = {
  id: 'plan-a',
  type: PlanType.BUSINESS,
  name: 'Business',
  priceCents: 49900,
};

function aggregate(status = SubscriptionStatus.ACTIVE) {
  return SubscriptionAggregate.reconstitute(
    {
      id: 'subscription-a',
      tenantId: 'tenant-a',
      planId: 'plan-a',
      status,
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      endedAt: null,
      deletedAt: null,
    },
    plan,
  );
}

describe('SubscriptionService', () => {
  const findByTenantId = jest.fn();
  const findById = jest.fn();
  const findAll = jest.fn();
  const save = jest.fn();
  const planFindById = jest.fn();
  const requireTenant = jest.fn().mockReturnValue('tenant-a');
  const repository = {
    findByTenantId,
    findById,
    findAll,
    save,
  } as unknown as SubscriptionRepository;
  const plans = { findById: planFindById } as unknown as PlanRepository;
  const tenantContext = {
    requireTenant,
  } as unknown as TenantContextService;
  const outbox = {} as OutboxPublisher;
  let service: SubscriptionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SubscriptionService(repository, plans, tenantContext, outbox);
  });

  it('rejects a second active subscription in the tenant scope', async () => {
    findByTenantId.mockResolvedValue(aggregate());

    await expect(service.createSubscription('plan-a')).rejects.toThrow(
      new ConflictException('Tenant already has an active subscription'),
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('creates a subscription for the trusted tenant and selected plan', async () => {
    findByTenantId.mockResolvedValue(null);
    planFindById.mockResolvedValue(plan);
    save.mockResolvedValue(undefined);

    await expect(service.createSubscription('plan-a')).resolves.toEqual(
      expect.objectContaining({
        tenantId: 'tenant-a',
        planId: 'plan-a',
        status: 'ACTIVE',
      }),
    );
    expect(requireTenant).toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('maps missing plan and subscription resources to not found', async () => {
    findByTenantId.mockResolvedValue(null);
    planFindById.mockResolvedValue(null);
    await expect(service.createSubscription('missing-plan')).rejects.toThrow(
      new NotFoundException('Plan not found'),
    );

    findById.mockResolvedValue(null);
    await expect(service.getSubscriptionById('subscription-b')).rejects.toThrow(
      new NotFoundException('Subscription not found'),
    );
  });

  it('cancels and suspends through the tenant-scoped aggregate', async () => {
    const current = aggregate();
    findByTenantId.mockResolvedValue(current);
    save.mockResolvedValue(undefined);

    await expect(service.cancelSubscription('requested')).resolves.toEqual(
      expect.objectContaining({ status: SubscriptionStatus.CANCELLED }),
    );
    const suspended = aggregate();
    findByTenantId.mockResolvedValue(suspended);
    await expect(
      service.suspendSubscription('payment failure'),
    ).resolves.toEqual(
      expect.objectContaining({ status: SubscriptionStatus.SUSPENDED }),
    );
    expect(save).toHaveBeenCalledTimes(2);
  });
});
