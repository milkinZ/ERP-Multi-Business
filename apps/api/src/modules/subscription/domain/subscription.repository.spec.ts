import { PrismaService } from '../../../core/database/prisma.service';
import {
  PlanType,
  SubscriptionAggregate,
  SubscriptionStatus,
} from './subscription.aggregate';
import { SubscriptionRepository } from './subscription.repository';

describe('SubscriptionRepository', () => {
  const upsert = jest.fn();
  const outboxCreate = jest.fn();
  const subscriptionHistoryCreateMany = jest.fn();
  const subscriptionHistoryFindMany = jest.fn();
  const subscriptionHistoryCount = jest.fn();
  const transaction = jest.fn();
  let savedStatus: SubscriptionStatus | undefined;
  let savedEvents: Array<{
    tenantId: string;
    type: string;
    payload: string;
    status: string;
  }>;
  const tx = {
    subscription: { upsert },
    outboxEvent: { create: outboxCreate },
    subscriptionHistory: {
      createMany: subscriptionHistoryCreateMany,
      findMany: subscriptionHistoryFindMany,
      count: subscriptionHistoryCount,
    },
  };
  const prisma = {
    $transaction: transaction,
    subscriptionHistory: {
      findMany: subscriptionHistoryFindMany,
      count: subscriptionHistoryCount,
    },
  } as unknown as PrismaService;
  let repository: SubscriptionRepository;
  let savedPendingPlanIds: Array<string | null>;

  beforeEach(() => {
    jest.clearAllMocks();
    savedStatus = undefined;
    savedEvents = [];
    savedPendingPlanIds = [];
    transaction.mockImplementation(
      (callback: (client: typeof tx) => Promise<void>) => callback(tx),
    );
    upsert.mockImplementation(
      (args: {
        create: { pendingPlanId: string | null };
        update: { status: SubscriptionStatus; pendingPlanId: string | null };
      }) => {
        savedStatus = args.update.status;
        savedPendingPlanIds = [
          args.create.pendingPlanId,
          args.update.pendingPlanId,
        ];
        return Promise.resolve({});
      },
    );
    outboxCreate.mockImplementation(
      (args: {
        data: {
          tenantId: string;
          type: string;
          payload: string;
          status: string;
        };
      }) => {
        savedEvents.push(args.data);
        return Promise.resolve({});
      },
    );
    subscriptionHistoryCreateMany.mockResolvedValue({ count: 1 });
    repository = new SubscriptionRepository(prisma);
  });

  it('persists the subscription and its domain events in one transaction', async () => {
    const aggregate = SubscriptionAggregate.reconstitute(
      {
        id: 'subscription-a',
        tenantId: 'tenant-a',
        planId: 'plan-a',
        status: SubscriptionStatus.ACTIVE,
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        endedAt: null,
        deletedAt: null,
      },
      {
        id: 'plan-a',
        type: PlanType.BUSINESS,
        name: 'Business',
        priceCents: 49900,
      },
    );
    aggregate.cancel('customer request');

    await repository.save(aggregate);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(savedStatus).toBe(SubscriptionStatus.CANCELLED);
    expect(savedPendingPlanIds).toEqual([null, null]);
    expect(outboxCreate).toHaveBeenCalledTimes(1);
    expect(subscriptionHistoryCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          subscriptionId: 'subscription-a',
          tenantId: 'tenant-a',
          eventType: 'subscription.cancelled',
          actorType: 'SYSTEM',
          metadata: {},
        }),
      ],
    });
    expect(savedEvents[0]?.tenantId).toBe('tenant-a');
    expect(savedEvents[0]?.type).toBe('subscription.cancelled');
    expect(savedEvents[0]?.status).toBe('PENDING');
    expect(aggregate.peekDomainEvents()).toHaveLength(0);
  });

  it('retains domain events if the transaction fails so the aggregate is not left partially drained', async () => {
    const aggregate = SubscriptionAggregate.reconstitute(
      {
        id: 'subscription-a',
        tenantId: 'tenant-a',
        planId: 'plan-a',
        status: SubscriptionStatus.ACTIVE,
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        endedAt: null,
        deletedAt: null,
      },
      {
        id: 'plan-a',
        type: PlanType.BUSINESS,
        name: 'Business',
        priceCents: 49900,
      },
    );
    aggregate.suspend('payment failure');
    outboxCreate.mockRejectedValueOnce(new Error('outbox write failed'));

    await expect(repository.save(aggregate)).rejects.toThrow(
      'outbox write failed',
    );
    expect(aggregate.peekDomainEvents()).toHaveLength(1);
  });

  it('records safe plan-change metadata without persisting free-form event reasons', async () => {
    const aggregate = SubscriptionAggregate.reconstitute(
      {
        id: 'subscription-a',
        tenantId: 'tenant-a',
        planId: 'plan-a',
        status: SubscriptionStatus.ACTIVE,
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        endedAt: null,
        deletedAt: null,
      },
      {
        id: 'plan-a',
        type: PlanType.BUSINESS,
        name: 'Business',
        priceCents: 49900,
      },
    );
    aggregate.schedulePlanChange({
      id: 'plan-b',
      type: PlanType.ENTERPRISE,
      name: 'Enterprise',
      priceCents: 99900,
    });

    await repository.save(aggregate);

    expect(subscriptionHistoryCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          eventType: 'subscription.plan-change.scheduled',
          metadata: {
            currentPlanId: 'plan-a',
            previousPendingPlanId: null,
            pendingPlanId: 'plan-b',
            effectiveAt: 'NEXT_RENEWAL',
          },
        }),
      ],
    });
  });

  it('reads bounded history by both subscription and trusted tenant identifiers', async () => {
    const data = [{ id: 'history-1', eventType: 'subscription.created' }];
    subscriptionHistoryFindMany.mockResolvedValue(data);
    subscriptionHistoryCount.mockResolvedValue(3);

    await expect(
      repository.findHistory('subscription-a', 'tenant-a', 10, 5),
    ).resolves.toEqual({ data, total: 3, skip: 10, take: 5 });
    expect(subscriptionHistoryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { subscriptionId: 'subscription-a', tenantId: 'tenant-a' },
        skip: 10,
        take: 5,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(subscriptionHistoryCount).toHaveBeenCalledWith({
      where: { subscriptionId: 'subscription-a', tenantId: 'tenant-a' },
    });
  });
});
