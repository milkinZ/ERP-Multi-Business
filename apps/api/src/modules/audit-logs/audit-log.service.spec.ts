import { DOMAIN_EVENTS, DomainEvent } from '../../core/events/domain-events';
import { DomainEventBus } from '../../core/events/domain-event-bus.service';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditLogService } from './audit-log.service';

describe('AuditLogService', () => {
  const create = jest.fn();
  const findMany = jest.fn();
  const count = jest.fn();
  const findFirst = jest.fn();
  const subscribers = new Map<string, (event: DomainEvent) => Promise<void>>();
  const prisma = {
    auditLog: {
      create,
      findMany,
      count,
      findFirst,
    },
  } as unknown as PrismaService;
  const eventBus = {
    subscribe: jest.fn(
      (type: string, handler: (event: DomainEvent) => Promise<void>) => {
        subscribers.set(type, handler);
      },
    ),
  } as unknown as DomainEventBus;
  const service = new AuditLogService(prisma, eventBus);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists an order event with tenant, outlet, entity, action, and metadata', async () => {
    create.mockResolvedValue({ id: 'audit-1' });
    const handler = subscribers.get(DOMAIN_EVENTS.ORDER_CREATED);

    await handler?.({
      type: DOMAIN_EVENTS.ORDER_CREATED,
      payload: {
        tenantId: 'tenant-a',
        outletId: 'outlet-a',
        orderId: 'order-a',
      },
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-a',
        userId: null,
        outletId: 'outlet-a',
        entity: 'Order',
        entityId: 'order-a',
        action: 'CREATE',
        metadata: { eventType: 'ORDER_CREATED' },
      },
    });
  });

  it('does not propagate audit persistence failures into the domain event handler', async () => {
    create.mockRejectedValue(new Error('db unavailable'));

    await expect(
      service.createAuditLog('tenant-a', {
        entity: 'Order',
        entityId: 'order-a',
        action: 'CREATE',
      }),
    ).resolves.toBeUndefined();
  });

  it('applies tenant, outlet, filters, and pagination to list queries', async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await service.listAuditLogs(
      'tenant-a',
      { page: 2, limit: 10, entity: 'Order', action: 'CREATE' },
      'outlet-a',
    );

    const [findManyArgs] = findMany.mock.calls[0] as [
      { where: unknown; skip: number; take: number },
    ];
    expect(findManyArgs.where).toEqual({
      tenantId: 'tenant-a',
      outletId: 'outlet-a',
      entity: { contains: 'Order', mode: 'insensitive' },
      action: { contains: 'CREATE', mode: 'insensitive' },
      deletedAt: null,
    });
    expect(findManyArgs.skip).toBe(10);
    expect(findManyArgs.take).toBe(10);
  });

  it('looks up a single audit record by both id and tenant', async () => {
    (prisma.auditLog.findFirst as jest.Mock).mockResolvedValue(null);

    await service.getAuditLog('audit-a', 'tenant-b');

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'audit-a', tenantId: 'tenant-b', deletedAt: null },
    });
  });
});
