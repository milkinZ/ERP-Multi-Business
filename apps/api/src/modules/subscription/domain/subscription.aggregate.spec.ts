import {
  PlanType,
  SubscriptionAggregate,
  SubscriptionStatus,
} from './subscription.aggregate';

const plan = {
  id: 'plan-a',
  type: PlanType.BUSINESS,
  name: 'Business',
  priceCents: 49900,
};

function subscription(status: SubscriptionStatus = SubscriptionStatus.TRIAL) {
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

describe('SubscriptionAggregate', () => {
  it('activates trial subscriptions and is idempotent when already active', () => {
    const aggregate = subscription();

    aggregate.activate();
    expect(aggregate.status).toBe(SubscriptionStatus.ACTIVE);
    aggregate.activate();
    expect(aggregate.pullDomainEvents()).toHaveLength(1);
  });

  it('rejects activation from terminal states', () => {
    expect(() => subscription(SubscriptionStatus.CANCELLED).activate()).toThrow(
      'Cannot activate a cancelled subscription',
    );
    expect(() => subscription(SubscriptionStatus.EXPIRED).activate()).toThrow(
      'Cannot activate an expired subscription',
    );
  });

  it('does not reactivate soft-deleted or time-expired subscriptions', () => {
    const expired = SubscriptionAggregate.reconstitute(
      {
        id: 'subscription-a',
        tenantId: 'tenant-a',
        planId: 'plan-a',
        status: SubscriptionStatus.SUSPENDED,
        startedAt: new Date('2025-01-01T00:00:00.000Z'),
        endedAt: new Date('2025-01-02T00:00:00.000Z'),
        deletedAt: null,
      },
      plan,
    );

    expect(expired.canActivate()).toBe(false);
    expect(() => expired.activate()).toThrow(
      'Cannot activate an expired subscription',
    );
  });

  it('covers cancellation, suspension, past-due, expiration, and plan changes', () => {
    const aggregate = subscription();

    aggregate.cancel('customer request');
    aggregate.cancel('duplicate request');
    expect(aggregate.status).toBe(SubscriptionStatus.CANCELLED);
    expect(aggregate.pullDomainEvents()).toHaveLength(1);

    const suspended = subscription();
    suspended.suspend('payment failed');
    expect(suspended.status).toBe(SubscriptionStatus.SUSPENDED);
    suspended.markPastDue(49900);
    expect(suspended.status).toBe(SubscriptionStatus.PAST_DUE);
    suspended.expire();
    expect(suspended.status).toBe(SubscriptionStatus.EXPIRED);

    const scheduled = subscription(SubscriptionStatus.ACTIVE);
    const enterprisePlan = {
      ...plan,
      id: 'plan-enterprise',
      type: PlanType.ENTERPRISE,
    };
    scheduled.schedulePlanChange(enterprisePlan);
    expect(scheduled.planId).toBe('plan-a');
    expect(scheduled.pendingPlanId).toBe('plan-enterprise');
    expect(scheduled.pullDomainEvents()[0]).toMatchObject({
      type: 'subscription.plan-change.scheduled',
      payload: {
        currentPlanId: 'plan-a',
        previousPendingPlanId: null,
        pendingPlanId: 'plan-enterprise',
        effectiveAt: 'NEXT_RENEWAL',
      },
    });
    scheduled.schedulePlanChange(enterprisePlan);
    expect(scheduled.pullDomainEvents()).toHaveLength(0);

    scheduled.schedulePlanChange(plan);
    expect(scheduled.pendingPlanId).toBeNull();
    expect(scheduled.pullDomainEvents()[0]).toMatchObject({
      payload: {
        previousPendingPlanId: 'plan-enterprise',
        pendingPlanId: null,
      },
    });
    scheduled.schedulePlanChange(enterprisePlan);
    scheduled.renew(new Date('2026-02-01'), new Date('2026-03-01'));
    expect(scheduled.planId).toBe('plan-enterprise');
    expect(scheduled.pendingPlanId).toBeNull();
    expect(scheduled.pullDomainEvents().map((event) => event.type)).toEqual([
      'subscription.plan-change.scheduled',
      'subscription.plan.changed',
      'subscription.renewed',
    ]);
  });

  it('rejects invalid terminal lifecycle transitions', () => {
    expect(() =>
      subscription(SubscriptionStatus.CANCELLED).renew(new Date(), new Date()),
    ).toThrow('Cannot renew a cancelled subscription');
    expect(() => subscription(SubscriptionStatus.EXPIRED).suspend()).toThrow(
      'Cannot suspend an expired subscription',
    );
    expect(() => subscription(SubscriptionStatus.EXPIRED).cancel()).toThrow(
      'Cannot cancel an already expired subscription',
    );
  });

  it('does not emit duplicate renewal events for an already-renewed period', () => {
    const aggregate = subscription(SubscriptionStatus.ACTIVE);
    const periodStart = new Date('2026-02-01T00:00:00.000Z');
    const periodEnd = new Date('2026-02-28T23:59:59.999Z');

    aggregate.renew(periodStart, periodEnd);
    expect(aggregate.endedAt).toEqual(periodEnd);
    expect(aggregate.pullDomainEvents()).toHaveLength(1);

    aggregate.renew(periodStart, periodEnd);
    expect(aggregate.pullDomainEvents()).toHaveLength(0);
  });

  it('rejects an invalid renewal period', () => {
    const aggregate = subscription(SubscriptionStatus.ACTIVE);

    expect(() =>
      aggregate.renew(
        new Date('2026-03-01T00:00:00.000Z'),
        new Date('2026-03-01T00:00:00.000Z'),
      ),
    ).toThrow('Billing period start must be before its end');
  });
});
