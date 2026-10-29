import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

import { DomainEventBus } from '../../core/events/domain-event-bus.service';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  const findProductsByIds = jest.fn();
  const createOrder = jest.fn();
  const findAll = jest.fn();
  const findOne = jest.fn();
  const findTenantById = jest.fn();
  const findOneAggregate = jest.fn();
  const updateStatus = jest.fn();
  const markPaidRepository = jest.fn();
  const cancelOrderRepository = jest.fn();
  const markCompletedRepository = jest.fn();
  const releaseReservation = jest.fn();
  const repository = {
    findProductsByIds,
    createOrder,
    findAll,
    findOne,
    findTenantById,
    findOneAggregate,
    updateStatus,
    markPaid: markPaidRepository,
    cancelOrder: cancelOrderRepository,
    markCompleted: markCompletedRepository,
    releaseToKitchen: jest.fn(),
  } as unknown as OrdersRepository;
  const publish = jest.fn();
  const events = { publish } as unknown as DomainEventBus;
  const inventoryReservations = {
    releaseReservation,
  } as never;
  let service: OrdersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OrdersService(repository, events, inventoryReservations);
  });

  it('prices order items from tenant-scoped products and emits both creation events', async () => {
    const order = { id: 'order-a', totalAmount: 650 };
    findProductsByIds.mockResolvedValue([
      { id: 'product-a', price: 250 },
      { id: 'product-b', price: 400 },
    ]);
    createOrder.mockResolvedValue(order);

    await expect(
      service.create('tenant-a', 'outlet-a', [
        { productId: 'product-a', quantity: 1 },
        { productId: 'product-b', quantity: 1 },
      ]),
    ).resolves.toBe(order);

    expect(findProductsByIds).toHaveBeenCalledWith(
      ['product-a', 'product-b'],
      'tenant-a',
    );
    expect(createOrder).toHaveBeenCalledWith(
      'tenant-a',
      'outlet-a',
      expect.stringMatching(/^ORD-\d+$/),
      650,
      [
        { productId: 'product-a', quantity: 1, price: 250, subtotal: 250 },
        { productId: 'product-b', quantity: 1, price: 400, subtotal: 400 },
      ],
      'REGULAR',
    );
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        payload: {
          orderId: 'order-a',
          tenantId: 'tenant-a',
          outletId: 'outlet-a',
        },
      }),
    );
  });

  it('rejects an order when a tenant-scoped product is missing', async () => {
    findProductsByIds.mockResolvedValue([{ id: 'product-a', price: 250 }]);

    await expect(
      service.create('tenant-a', null, [
        { productId: 'product-a', quantity: 1 },
        { productId: 'product-b', quantity: 1 },
      ]),
    ).rejects.toThrow(new BadRequestException('Some products not found'));
    expect(createOrder).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('preserves authenticated tenant and outlet scope for reads', async () => {
    const user = {
      scope: 'tenant' as const,
      userId: 'user-a',
      tenantId: 'tenant-a',
      sessionId: 'session-a',
      outletId: 'outlet-a',
      roleId: 'role-a',
      permissions: [],
    };
    findAll.mockResolvedValue([]);
    findOne.mockResolvedValue(null);

    await expect(service.findAll(user)).resolves.toEqual([]);
    await expect(service.findOne('order-b', user)).resolves.toBeNull();
    expect(findAll).toHaveBeenCalledWith('tenant-a', 'outlet-a');
    expect(findOne).toHaveBeenCalledWith('order-b', 'tenant-a', 'outlet-a');
  });

  it('rejects direct kitchen workflow status changes', async () => {
    await expect(
      service.updateStatus(
        'order-a',
        { tenantId: 'tenant-a', outletId: null } as never,
        OrderStatus.COMPLETED,
      ),
    ).rejects.toThrow('managed by payment and kitchen actions');
    expect(findOneAggregate).not.toHaveBeenCalled();
  });

  it('requires payment endpoint for PAID status changes', async () => {
    findTenantById.mockResolvedValue({ businessType: 'CAFE' });
    findOneAggregate.mockResolvedValue({ status: OrderStatus.PENDING });

    await expect(
      service.updateStatus(
        'order-a',
        { tenantId: 'tenant-a', outletId: null } as never,
        OrderStatus.PAID,
      ),
    ).rejects.toThrow('Use payment endpoint');
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('does not duplicate cancellation side effects when the aggregate rejects cancellation', async () => {
    findOneAggregate.mockResolvedValue({
      cancel: () => {
        throw new Error('Cannot cancel a completed order');
      },
    });
    findOne.mockResolvedValue({ id: 'order-a', status: OrderStatus.COMPLETED });

    await expect(service.cancelOrder('order-a', 'tenant-a')).resolves.toEqual(
      expect.objectContaining({ status: OrderStatus.COMPLETED }),
    );
    expect(cancelOrderRepository).not.toHaveBeenCalled();
    expect(releaseReservation).not.toHaveBeenCalled();
  });

  it('releases reserved stock when an order is cancelled', async () => {
    findOneAggregate.mockResolvedValue({
      cancel: jest.fn(),
    });
    cancelOrderRepository.mockResolvedValue({
      id: 'order-a',
      status: OrderStatus.CANCELLED,
    });

    await service.cancelOrder('order-a', 'tenant-a');

    expect(cancelOrderRepository).toHaveBeenCalledWith(
      'order-a',
      'tenant-a',
      undefined,
      expect.any(Function),
    );
  });
});
