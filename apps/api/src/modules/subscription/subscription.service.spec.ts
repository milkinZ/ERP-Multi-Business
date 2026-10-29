import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import {
  PlanType,
  SubscriptionAggregate,
  SubscriptionStatus,
} from './domain/subscription.aggregate';
import { SubscriptionRepository } from './domain/subscription.repository';
import { PlanRepository } from './plans/plan.repository';
import { SubscriptionService } from './subscription.service';
import { TenantContextService } from '../tenants/tenant-context.service';
import { SubscriptionHistoryQueryDto } from './dto/subscription-history-query.dto';

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
  const findHistory = jest.fn();
  const save = jest.fn();
  const planFindById = jest.fn();
  const planFindAll = jest.fn();
  const requireTenant = jest.fn().mockReturnValue('tenant-a');
  const repository = {
    findByTenantId,
    findById,
    findAll,
    findHistory,
    save,
  } as unknown as SubscriptionRepository;
  const plans = {
    findById: planFindById,
    findAll: planFindAll,
  } as unknown as PlanRepository;
  const tenantContext = {
    requireTenant,
  } as unknown as TenantContextService;
  let service: SubscriptionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SubscriptionService(repository, plans, tenantContext);
  });

  it('returns bounded tenant-scoped subscription history', async () => {
    const history = {
      data: [{ eventType: 'subscription.plan-change.scheduled' }],
      total: 1,
      skip: 0,
      take: 50,
    };
    findById.mockResolvedValue(aggregate());
    findHistory.mockResolvedValue(history);
    const query = Object.assign(new SubscriptionHistoryQueryDto(), {
      skip: 0,
      take: 50,
    });

    await expect(
      service.getSubscriptionHistory('subscription-a', query),
    ).resolves.toBe(history);
    expect(findById).toHaveBeenCalledWith('subscription-a', 'tenant-a');
    expect(findHistory).toHaveBeenCalledWith(
      'subscription-a',
      'tenant-a',
      0,
      50,
    );
  });

  it('does not return history for another tenant subscription', async () => {
    findById.mockResolvedValue(null);
    await expect(
      service.getSubscriptionHistory(
        'subscription-a',
        new SubscriptionHistoryQueryDto(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findHistory).not.toHaveBeenCalled();
  });

  it('rejects a second subscription in the tenant scope', async () => {
    findByTenantId.mockResolvedValue(aggregate());

    await expect(service.createSubscription('plan-a')).rejects.toThrow(
      new ConflictException('Tenant already has a subscription'),
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects creating a second subscription for a tenant with a terminal subscription', async () => {
    findByTenantId.mockResolvedValue(aggregate(SubscriptionStatus.CANCELLED));

    await expect(service.createSubscription('plan-a')).rejects.toThrow(
      new ConflictException('Tenant already has a subscription'),
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

  it('returns only the public fields of active plans', async () => {
    planFindAll.mockResolvedValue([
      {
        ...plan,
        deletedAt: null,
        createdAt: new Date(),
        internalCode: 'private',
      },
    ]);

    await expect(service.listPlans()).resolves.toEqual([
      {
        id: 'plan-a',
        type: PlanType.BUSINESS,
        name: 'Business',
        priceCents: 49900,
      },
    ]);
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

  it('changes the plan only after loading the requested subscription in tenant scope', async () => {
    const current = aggregate();
    findById.mockResolvedValue(current);
    planFindById.mockResolvedValue({
      ...plan,
      id: 'plan-enterprise',
      type: PlanType.ENTERPRISE,
      name: 'Enterprise',
      priceCents: 99900,
    });
    save.mockResolvedValue(undefined);

    await expect(
      service.changePlan('subscription-a', 'plan-enterprise'),
    ).resolves.toMatchObject({
      id: 'subscription-a',
      tenantId: 'tenant-a',
      planId: 'plan-a',
      pendingPlanId: 'plan-enterprise',
      pendingPlanEffectiveAt: 'NEXT_RENEWAL',
    });
    expect(findById).toHaveBeenCalledWith('subscription-a', 'tenant-a');
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('rejects a change-plan request for another tenant subscription', async () => {
    findById.mockResolvedValue(null);

    await expect(
      service.changePlan('subscription-other', 'plan-enterprise'),
    ).rejects.toThrow(new NotFoundException('Subscription not found'));
    expect(findById).toHaveBeenCalledWith('subscription-other', 'tenant-a');
    expect(planFindById).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('cancels, suspends, and resumes through tenant-scoped subscription IDs', async () => {
    const current = aggregate();
    findById.mockResolvedValue(current);
    save.mockResolvedValue(undefined);

    await expect(
      service.cancelSubscription('subscription-a', 'customer request'),
    ).resolves.toEqual(
      expect.objectContaining({ status: SubscriptionStatus.CANCELLED }),
    );
    const suspended = aggregate(SubscriptionStatus.ACTIVE);
    findById.mockResolvedValue(suspended);
    await expect(
      service.suspendSubscription('subscription-a', 'payment failure'),
    ).resolves.toEqual(
      expect.objectContaining({ status: SubscriptionStatus.SUSPENDED }),
    );
    await expect(service.resumeSubscription('subscription-a')).resolves.toEqual(
      expect.objectContaining({ status: SubscriptionStatus.ACTIVE }),
    );
    expect(findById).toHaveBeenCalledWith('subscription-a', 'tenant-a');
    expect(save).toHaveBeenCalledTimes(3);
  });

  it('rejects resuming a cancelled subscription', async () => {
    findById.mockResolvedValue(aggregate(SubscriptionStatus.CANCELLED));

    await expect(service.resumeSubscription('subscription-a')).rejects.toThrow(
      new BadRequestException('Subscription cannot be resumed'),
    );
    expect(save).not.toHaveBeenCalled();
  });
});
