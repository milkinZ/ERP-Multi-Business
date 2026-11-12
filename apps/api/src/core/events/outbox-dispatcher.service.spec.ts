import { DomainEventBus } from './domain-event-bus.service';
import { DOMAIN_EVENTS, DomainEvent } from './domain-events';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { PrismaService } from '../database/prisma.service';

describe('OutboxDispatcherService', () => {
  const count = jest.fn();
  const findMany = jest.fn();
  const update = jest.fn();
  const prisma = {
    outboxEvent: { count, findMany, update },
  } as unknown as PrismaService;
  const publish = jest.fn();
  const eventBus = { publish } as unknown as DomainEventBus;
  let service: OutboxDispatcherService;

  const event: DomainEvent = {
    type: DOMAIN_EVENTS.ORDER_CREATED,
    payload: { orderId: 'order-a', tenantId: 'tenant-a' },
  };
  type OutboxUpdate = {
    where: { id: string };
    data: {
      status: string;
      attemptCount?: number;
      nextAttemptAt?: Date | null;
      error?: string | null;
    };
  };
  const getUpdateData = (id: string) => {
    const calls = update.mock.calls as Array<[OutboxUpdate]>;
    return calls.find(([call]) => call.where.id === id)?.[0].data;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    count.mockResolvedValue(1);
    update.mockResolvedValue({});
    service = new OutboxDispatcherService(prisma, eventBus);
  });

  it('publishes pending events and marks them processed', async () => {
    findMany.mockResolvedValue([
      {
        id: 'outbox-a',
        type: event.type,
        payload: JSON.stringify(event),
        attemptCount: 0,
      },
    ]);

    await expect(service.dispatchBatch(10)).resolves.toBeUndefined();
    type Query = {
      where: {
        status: string;
        OR: Array<{ nextAttemptAt: null } | { nextAttemptAt: { lte: Date } }>;
      };
      take: number;
      orderBy: { createdAt: string };
    };
    const queries = findMany.mock.calls as Array<[Query]>;
    expect(queries[0][0].where.status).toBe('PENDING');
    expect(queries[0][0].where.OR[0]).toEqual({ nextAttemptAt: null });
    expect(queries[0][0].where.OR[1].nextAttemptAt).toHaveProperty('lte');
    expect(queries[0][0].take).toBe(10);
    expect(queries[0][0].orderBy).toEqual({ createdAt: 'asc' });
    expect(publish).toHaveBeenCalledWith({
      ...event,
      eventId: 'outbox-a',
    });
    const processedData = expect.objectContaining({
      status: 'PROCESSED',
    }) as unknown as Record<string, unknown>;
    const processedUpdate = expect.objectContaining({
      where: { id: 'outbox-a' },
      data: processedData,
    }) as unknown as Record<string, unknown>;
    expect(update).toHaveBeenCalledWith(processedUpdate);
  });

  it('revives serialized occurredAt values before publishing', async () => {
    const occurredAt = '2026-09-25T09:17:00.000Z';
    const serializedEvent = {
      ...event,
      occurredAt,
    };
    findMany.mockResolvedValue([
      {
        id: 'outbox-with-timestamp',
        type: event.type,
        payload: JSON.stringify(serializedEvent),
        tenantId: 'tenant-a',
        attemptCount: 0,
      },
    ]);

    await service.dispatchBatch();

    expect(publish).toHaveBeenCalledWith({
      ...event,
      occurredAt: new Date(occurredAt),
      eventId: 'outbox-with-timestamp',
    });
  });

  it('rejects invalid occurredAt values without publishing them', async () => {
    findMany.mockResolvedValue([
      {
        id: 'outbox-invalid-timestamp',
        type: event.type,
        payload: JSON.stringify({ ...event, occurredAt: 'not-a-date' }),
        tenantId: 'tenant-a',
        attemptCount: 0,
      },
    ]);

    await service.dispatchBatch();

    expect(publish).not.toHaveBeenCalled();
    const updateData = getUpdateData('outbox-invalid-timestamp');
    expect(updateData?.status).toBe('PENDING');
    expect(updateData?.attemptCount).toBe(1);
    expect(updateData?.nextAttemptAt).toBeInstanceOf(Date);
    expect(updateData?.error).toBe('Invalid domain event occurredAt in outbox');
  });

  it('marks invalid payloads failed without publishing them', async () => {
    findMany.mockResolvedValue([
      {
        id: 'outbox-invalid',
        type: 'invalid',
        payload: JSON.stringify({}),
        attemptCount: 0,
      },
    ]);

    await service.dispatchBatch();

    expect(publish).not.toHaveBeenCalled();
    const updateData = getUpdateData('outbox-invalid');
    expect(updateData?.status).toBe('PENDING');
    expect(updateData?.attemptCount).toBe(1);
    expect(updateData?.nextAttemptAt).toBeInstanceOf(Date);
    expect(updateData?.error).toBe('Invalid domain event payload in outbox');
  });

  it('marks publish failures failed and continues dispatch contract safely', async () => {
    findMany.mockResolvedValue([
      {
        id: 'outbox-failed',
        type: event.type,
        payload: event,
        attemptCount: 0,
      },
    ]);
    publish.mockRejectedValue(new Error('broker unavailable'));

    await expect(service.dispatchBatch()).resolves.toBeUndefined();
    const updateData = getUpdateData('outbox-failed');
    expect(updateData?.status).toBe('PENDING');
    expect(updateData?.attemptCount).toBe(1);
    expect(updateData?.nextAttemptAt).toBeInstanceOf(Date);
    expect(updateData?.error).toBe('broker unavailable');
  });

  it('marks an event failed after the configured attempt budget is exhausted', async () => {
    findMany.mockResolvedValue([
      {
        id: 'outbox-exhausted',
        type: event.type,
        payload: event,
        attemptCount: 4,
      },
    ]);
    publish.mockRejectedValue(new Error('broker unavailable'));

    await service.dispatchBatch();

    expect(update).toHaveBeenCalledWith({
      where: { id: 'outbox-exhausted' },
      data: {
        status: 'FAILED',
        attemptCount: 5,
        nextAttemptAt: null,
        error: 'broker unavailable',
      },
    });
  });
});
