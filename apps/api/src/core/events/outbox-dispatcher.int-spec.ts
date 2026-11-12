import { PrismaClient } from '@prisma/client';

import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';
import { DOMAIN_EVENTS, DomainEvent } from './domain-events';
import { DomainEventBus } from './domain-event-bus.service';
import { OutboxDispatcherService } from './outbox-dispatcher.service';

const prisma = new PrismaClient();
const publish = jest.fn();
const eventBus = { publish } as unknown as DomainEventBus;
const dispatcher = new OutboxDispatcherService(prisma as never, eventBus);
const prefix = 'it-outbox-dispatcher';

async function cleanup() {
  await prisma.outboxEvent.deleteMany({
    where: {
      type: {
        in: [DOMAIN_EVENTS.ORDER_CREATED, 'invalid.integration.event'],
      },
    },
  });
}

describe('OutboxDispatcherService integration', () => {
  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    await prisma.$connect();
    await cleanup();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('publishes a pending database event and marks it processed', async () => {
    const event: DomainEvent = {
      type: DOMAIN_EVENTS.ORDER_CREATED,
      payload: { orderId: `${prefix}-order`, tenantId: `${prefix}-tenant` },
    };
    const row = await prisma.outboxEvent.create({
      data: {
        type: event.type,
        payload: JSON.stringify(event),
        status: 'PENDING',
      },
    });

    await dispatcher.dispatchBatch();

    expect(publish).toHaveBeenCalledWith({
      ...event,
      eventId: row.id,
    });
    await expect(
      prisma.outboxEvent.findUnique({ where: { id: row.id } }),
    ).resolves.toEqual(expect.objectContaining({ status: 'PROCESSED' }));
  });

  it('schedules invalid payloads for bounded retry in the real database', async () => {
    const row = await prisma.outboxEvent.create({
      data: {
        type: 'invalid.integration.event',
        payload: JSON.stringify({ invalid: true }),
        status: 'PENDING',
      },
    });

    await dispatcher.dispatchBatch();

    expect(publish).not.toHaveBeenCalled();
    const updated = await prisma.outboxEvent.findUnique({
      where: { id: row.id },
    });
    expect(updated).toEqual(
      expect.objectContaining({
        status: 'PENDING',
        attemptCount: 1,
        error: 'Invalid domain event payload in outbox',
      }),
    );
    expect(updated?.nextAttemptAt).toBeInstanceOf(Date);
  });

  it('schedules broker failures for retry and leaves a recoverable database record', async () => {
    publish.mockRejectedValue(new Error('broker unavailable'));
    const row = await prisma.outboxEvent.create({
      data: {
        type: DOMAIN_EVENTS.ORDER_CREATED,
        payload: JSON.stringify({
          type: DOMAIN_EVENTS.ORDER_CREATED,
          payload: { orderId: `${prefix}-order`, tenantId: `${prefix}-tenant` },
        }),
        status: 'PENDING',
      },
    });

    await dispatcher.dispatchBatch();

    const updated = await prisma.outboxEvent.findUnique({
      where: { id: row.id },
    });
    expect(updated).toEqual(
      expect.objectContaining({
        status: 'PENDING',
        attemptCount: 1,
        error: 'broker unavailable',
      }),
    );
    expect(updated?.nextAttemptAt).toBeInstanceOf(Date);
  });
});
