import { BadRequestException, NotFoundException } from '@nestjs/common';

import { DomainEventBus } from '../../core/events/domain-event-bus.service';
import { KitchenTicketAggregate } from './domain/kitchen-ticket.aggregate';
import { KitchenStatus } from './domain/kitchen-status.enum';
import { KitchenRepository } from './kitchen.repository';
import { KitchenService } from './kitchen.service';

describe('KitchenService', () => {
  const findManyByTenant = jest.fn();
  const findTicketBySalesOrderId = jest.fn();
  const getSettings = jest.fn();
  const updateWaitThreshold = jest.fn();
  const updatePriority = jest.fn();
  const findBySalesOrderId = jest.fn();
  const updateStatus = jest.fn();
  const releaseReservation = jest.fn();
  const repository = {
    findManyByTenant,
    findTicketBySalesOrderId,
    getSettings,
    updateWaitThreshold,
    updatePriority,
    findBySalesOrderId,
    updateStatus,
  } as unknown as KitchenRepository;
  const publish = jest.fn();
  const events = { publish } as unknown as DomainEventBus;
  const inventoryReservations = { releaseReservation } as never;
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
    service = new KitchenService(repository, events, inventoryReservations);
  });

  it('returns only the authenticated tenant queue', async () => {
    findManyByTenant.mockResolvedValue([]);

    const query = {};
    await expect(
      service.getQueue('tenant-a', 'outlet-a', query),
    ).resolves.toEqual([]);
    expect(findManyByTenant).toHaveBeenCalledWith(
      'tenant-a',
      'outlet-a',
      query,
    );
  });

  it('returns tenant-scoped ticket details and reports missing tickets', async () => {
    const current = ticket();
    findTicketBySalesOrderId.mockResolvedValue(current);

    await expect(service.getTicket('order-a', 'tenant-a')).resolves.toBe(
      current,
    );
    expect(findTicketBySalesOrderId).toHaveBeenCalledWith(
      'order-a',
      'tenant-a',
      null,
    );

    findTicketBySalesOrderId.mockResolvedValue(null);
    await expect(
      service.getTicket('missing-order', 'tenant-a'),
    ).rejects.toThrow(new NotFoundException('Kitchen ticket not found'));
  });

  it('reads and updates tenant Kitchen wait settings', async () => {
    getSettings.mockResolvedValue({ waitThresholdMinutes: 15 });
    updateWaitThreshold.mockResolvedValue({ waitThresholdMinutes: 20 });

    await expect(service.getSettings('tenant-a')).resolves.toEqual({
      waitThresholdMinutes: 15,
    });
    await expect(
      service.updateWaitThreshold('tenant-a', 20, 'user-a'),
    ).resolves.toEqual({ waitThresholdMinutes: 20 });

    expect(getSettings).toHaveBeenCalledWith('tenant-a');
    expect(updateWaitThreshold).toHaveBeenCalledWith('tenant-a', 20, 'user-a');
  });

  it('updates ticket priority only within the authenticated tenant', async () => {
    updatePriority.mockResolvedValue(ticket());

    await expect(
      service.setPriority('order-a', 'tenant-a', 5, 'user-a'),
    ).resolves.toBeInstanceOf(KitchenTicketAggregate);
    expect(updatePriority).toHaveBeenCalledWith(
      'order-a',
      'tenant-a',
      5,
      'user-a',
      null,
    );
  });

  it('persists a cooking transition and emits tenant-scoped event', async () => {
    const current = ticket();
    findBySalesOrderId.mockResolvedValue(current);
    updateStatus.mockResolvedValue(current);

    await expect(service.startCooking('order-a', 'tenant-a')).resolves.toBe(
      current,
    );
    expect(updateStatus).toHaveBeenCalledWith(
      'order-a',
      'tenant-a',
      'COOKING',
      KitchenStatus.QUEUED,
      undefined,
      null,
    );
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
