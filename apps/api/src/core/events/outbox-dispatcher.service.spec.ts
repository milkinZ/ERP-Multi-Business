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

  beforeEach(() => {
    jest.clearAllMocks();
    count.mockResolvedValue(1);
    update.mockResolvedValue({});
    service = new OutboxDispatcherService(prisma, eventBus);
  });

  it('publishes pending events and marks them processed', async () => {
    findMany.mockResolvedValue([
      { id: 'outbox-a', type: event.type, payload: JSON.stringify(event) },
    ]);

    await expect(service.dispatchBatch(10)).resolves.toBeUndefined();
    expect(publish).toHaveBeenCalledWith(event);
    const processedData = expect.objectContaining({
      status: 'PROCESSED',
    }) as unknown as Record<string, unknown>;
    const processedUpdate = expect.objectContaining({
      where: { id: 'outbox-a' },
      data: processedData,
    }) as unknown as Record<string, unknown>;
    expect(update).toHaveBeenCalledWith(processedUpdate);
  });

  it('marks invalid payloads failed without publishing them', async () => {
    findMany.mockResolvedValue([
      { id: 'outbox-invalid', type: 'invalid', payload: JSON.stringify({}) },
    ]);

    await service.dispatchBatch();

    expect(publish).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'outbox-invalid' },
      data: {
        status: 'FAILED',
        error: 'Invalid domain event payload in outbox',
      },
    });
  });

  it('marks publish failures failed and continues dispatch contract safely', async () => {
    findMany.mockResolvedValue([
      { id: 'outbox-failed', type: event.type, payload: event },
    ]);
    publish.mockRejectedValue(new Error('broker unavailable'));

    await expect(service.dispatchBatch()).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'outbox-failed' },
      data: { status: 'FAILED', error: 'broker unavailable' },
    });
  });
});
