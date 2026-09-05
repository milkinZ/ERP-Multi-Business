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

    const upgraded = subscription(SubscriptionStatus.ACTIVE);
    upgraded.upgrade({ ...plan, type: PlanType.ENTERPRISE });
    const planChange = upgraded.pullDomainEvents()[0];
    expect(planChange.payload).toEqual({
      subscriptionId: 'subscription-a',
      tenantId: 'tenant-a',
      oldPlanType: PlanType.BUSINESS,
      newPlanType: PlanType.ENTERPRISE,
    });
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
});
