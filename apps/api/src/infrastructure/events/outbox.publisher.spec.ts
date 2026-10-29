import { PrismaService } from '../../core/database/prisma.service';
import { requestContext } from '../../core/request-context/request-context';
import { DOMAIN_EVENTS, DomainEvent } from '../../core/events/domain-events';
import { OutboxPublisher } from './outbox.publisher';

describe('OutboxPublisher', () => {
  const create = jest.fn();
  const prisma = { outboxEvent: { create } } as unknown as PrismaService;
  const publisher = new OutboxPublisher(prisma);
  let persistedData: {
    tenantId: string;
    type: string;
    status: string;
    payload: string;
  };
  const event: DomainEvent = {
    type: DOMAIN_EVENTS.ORDER_CREATED,
    payload: { orderId: 'order-a', tenantId: 'tenant-a' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    create.mockImplementation((args: { data: typeof persistedData }) => {
      persistedData = args.data;
      return Promise.resolve({ id: 'outbox-a' });
    });
  });

  it('persists pending event payload with trusted request observability context', async () => {
    await requestContext.run(
      {
        requestId: 'request-a',
        correlationId: 'correlation-a',
        tenantId: 'tenant-a',
        userId: 'user-a',
        outletId: 'outlet-a',
      },
      () => publisher.publish(event),
    );

    expect(persistedData).toEqual(
      expect.objectContaining({
        type: DOMAIN_EVENTS.ORDER_CREATED,
        status: 'PENDING',
      }),
    );
    const parsed = JSON.parse(persistedData.payload) as {
      type: string;
      payload: unknown;
      _observability: {
        requestId?: string;
        correlationId?: string;
        tenantId?: string;
      };
    };
    expect(parsed.type).toBe(DOMAIN_EVENTS.ORDER_CREATED);
    expect(parsed.payload).toEqual(event.payload);
    expect(parsed._observability).toEqual({
      requestId: 'request-a',
      correlationId: 'correlation-a',
      tenantId: 'tenant-a',
      userId: 'user-a',
      outletId: 'outlet-a',
    });
  });

  it('uses the target tenant in a platform event when no tenant context exists', async () => {
    const platformEvent: DomainEvent = {
      type: DOMAIN_EVENTS.SUPER_ADMIN_TENANT_ACTIVATED,
      payload: {
        tenantId: 'target-tenant',
        targetTenantId: 'target-tenant',
        actionedByPlatformIdentityId: 'platform-identity-a',
      },
    };

    await requestContext.run(
      { platformIdentityId: 'platform-identity-a' },
      () => publisher.publish(platformEvent),
    );

    expect(persistedData.tenantId).toBe('target-tenant');
  });

  it('rejects events without a tenant context or tenant payload', async () => {
    const tenantlessEvent = {
      type: 'test.tenantless',
      payload: {},
    } as never;

    await expect(
      requestContext.run({}, () => publisher.publish(tenantlessEvent)),
    ).rejects.toThrow('OUTBOX_TENANT_CONTEXT_MISSING');
    expect(create).not.toHaveBeenCalled();
  });
});
