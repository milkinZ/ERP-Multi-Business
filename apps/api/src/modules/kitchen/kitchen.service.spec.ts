import { BadRequestException } from '@nestjs/common';

import { DomainEventBus } from '../../core/events/domain-event-bus.service';
import { KitchenTicketAggregate } from './domain/kitchen-ticket.aggregate';
import { KitchenStatus } from './domain/kitchen-status.enum';
import { KitchenRepository } from './kitchen.repository';
import { KitchenService } from './kitchen.service';

describe('KitchenService', () => {
  const findManyByTenant = jest.fn();
  const findBySalesOrderId = jest.fn();
  const updateStatus = jest.fn();
  const repository = {
    findManyByTenant,
    findBySalesOrderId,
    updateStatus,
  } as unknown as KitchenRepository;
  const publish = jest.fn();
  const events = { publish } as unknown as DomainEventBus;
  let service: KitchenService;

  function ticket(status: KitchenStatus = KitchenStatus.QUEUED) {
    return KitchenTicketAggregate.fromPersistence({
      id: 'ticket-a',
      ticketNumber: 'T-A',
      salesOrderId: 'order-a',
      tenantId: 'tenant-a',
      outletId: 'outlet-a',
      items: [],
      status,
      priority: 0,
      createdById: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    service = new KitchenService(repository, events);
  });

  it('returns only the authenticated tenant queue', async () => {
    findManyByTenant.mockResolvedValue([]);

    await expect(service.getQueue('tenant-a')).resolves.toEqual([]);
    expect(findManyByTenant).toHaveBeenCalledWith('tenant-a');
  });

  it('persists a cooking transition and emits tenant-scoped event', async () => {
    const current = ticket();
    findBySalesOrderId.mockResolvedValue(current);
    updateStatus.mockResolvedValue(current);

    await expect(service.startCooking('order-a', 'tenant-a')).resolves.toBe(
      current,
    );
    expect(updateStatus).toHaveBeenCalledWith('order-a', 'tenant-a', 'COOKING');
    expect(publish).toHaveBeenCalledWith({
      type: 'kitchen.cooking.started',
      payload: {
        ticketId: 'ticket-a',
        salesOrderId: 'order-a',
        tenantId: 'tenant-a',
        outletId: 'outlet-a',
      },
    });
  });

  it('rejects missing tickets and persistence failures without publishing events', async () => {
    findBySalesOrderId.mockResolvedValue(null);
    await expect(service.startCooking('order-b', 'tenant-a')).rejects.toThrow(
      new BadRequestException('Kitchen ticket not found'),
    );

    findBySalesOrderId.mockResolvedValue(ticket(KitchenStatus.COOKING));
    updateStatus.mockResolvedValue(null);
    await expect(service.markReady('order-a', 'tenant-a')).rejects.toThrow(
      new BadRequestException('Failed to persist kitchen ticket'),
    );
    expect(publish).not.toHaveBeenCalled();
  });
});
