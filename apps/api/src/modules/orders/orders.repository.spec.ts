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
    repository = new OrdersRepository({ $transaction: transaction } as never);
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
});
