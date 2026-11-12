import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { OrdersRepository } from './orders.repository';

describe('OrdersRepository', () => {
  const updateMany = jest.fn();
  const findFirst = jest.fn();
  const transaction = jest.fn();
  const tx = {
    salesOrder: { updateMany, findFirst },
  };
  let repository: OrdersRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.mockImplementation(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    repository = new OrdersRepository(
      { $transaction: transaction } as never,
      { getForTenant: jest.fn() } as never,
    );
  });

  it('cancels the order and releases reservations in one transaction', async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: 'order-a', status: 'CANCELLED' });
    const releaseReservation = jest.fn<
      Promise<unknown>,
      [Prisma.TransactionClient]
    >(() => Promise.resolve());

    await repository.cancelOrder(
      'order-a',
      'tenant-a',
      'outlet-a',
      releaseReservation,
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'order-a',
        tenantId: 'tenant-a',
        status: { not: 'COMPLETED' },
        outletId: 'outlet-a',
      },
      data: { status: 'CANCELLED' },
    });
    expect(releaseReservation).toHaveBeenCalledWith(tx);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-a', tenantId: 'tenant-a', outletId: 'outlet-a' },
      }),
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('rolls back cancellation when reservation release fails', async () => {
    updateMany.mockResolvedValue({ count: 1 });
    const failure = new Error('Reservation release failed');
    const releaseReservation = jest
      .fn<Promise<unknown>, [Prisma.TransactionClient]>()
      .mockRejectedValue(failure);

    await expect(
      repository.cancelOrder('order-a', 'tenant-a', null, releaseReservation),
    ).rejects.toBe(failure);

    expect(findFirst).not.toHaveBeenCalled();
  });

  it('rejects a new order beyond the monthly cap before writing the order', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ currencyCode: 'IDR' }]),
      subscriptionMonthlyUsage: {
        upsert: jest.fn().mockResolvedValue({ orderCount: 2 }),
      },
      salesOrder: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      salesOrderItem: { createMany: jest.fn() },
    };
    const getForTenant = jest.fn().mockResolvedValue({
      planType: 'FREE',
      maxMonthlyOrders: 1,
    });
    transaction.mockImplementation(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    repository = new OrdersRepository(
      { $transaction: transaction } as never,
      { getForTenant } as never,
    );

    await expect(
      repository.createOrder('tenant-a', null, 'ORDER-OVER-LIMIT', 100, []),
    ).rejects.toThrow(ConflictException);

    expect(tx.subscriptionMonthlyUsage.upsert).toHaveBeenCalled();
    expect(tx.salesOrder.create).not.toHaveBeenCalled();
    expect(tx.salesOrderItem.createMany).not.toHaveBeenCalled();
  });

  it('allows the order that reaches the monthly cap and supports unlimited plans', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ currencyCode: 'IDR' }]),
      subscriptionMonthlyUsage: {
        upsert: jest.fn().mockResolvedValue({ orderCount: 1 }),
      },
      salesOrder: {
        create: jest.fn().mockResolvedValue({ id: 'order-a' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-a',
          SalesOrderItem: [],
        }),
      },
      salesOrderItem: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const getForTenant = jest.fn().mockResolvedValue({
      planType: 'ENTERPRISE',
      maxMonthlyOrders: 1,
    });
    transaction.mockImplementation(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    repository = new OrdersRepository(
      { $transaction: transaction } as never,
      { getForTenant } as never,
    );

    const created = await repository.createOrder(
      'tenant-a',
      null,
      'ORDER-AT-LIMIT',
      100,
      [],
    );

    expect(created.planUsage).toMatchObject({
      ordersUsed: 1,
      monthlyOrderLimit: 1,
      limitReached: true,
      overLimit: false,
    });
    expect(tx.salesOrder.create).toHaveBeenCalledTimes(1);
    expect(tx.salesOrderItem.createMany).toHaveBeenCalledWith({ data: [] });

    getForTenant.mockResolvedValue({
      planType: 'ENTERPRISE',
      maxMonthlyOrders: null,
    });
    tx.subscriptionMonthlyUsage.upsert.mockResolvedValue({
      orderCount: 2000,
    });
    const unlimited = await repository.createOrder(
      'tenant-a',
      null,
      'ORDER-UNLIMITED',
      100,
      [],
    );

    expect(unlimited.planUsage).toMatchObject({
      ordersUsed: 2000,
      monthlyOrderLimit: null,
      limitReached: false,
      overLimit: false,
    });
    expect(tx.salesOrder.create).toHaveBeenCalledTimes(2);
  });
});
