import { BadRequestException } from '@nestjs/common';
import { BusinessType } from '@prisma/client';

import { InventoryReservationService } from './inventory-reservation.service';

describe('InventoryReservationService', () => {
  const transaction = jest.fn();
  const rowLock = jest.fn();
  const prisma = { $transaction: transaction };
  const costing = {
    lockItem: jest.fn().mockResolvedValue({}),
    issue: jest.fn(),
    restore: jest.fn(),
  };
  let service: InventoryReservationService;

  beforeEach(() => {
    jest.clearAllMocks();
    rowLock.mockResolvedValue([{ id: 'order-a' }]);
    transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      Promise.resolve(callback({ $queryRaw: rowLock })),
    );
    service = new InventoryReservationService(
      prisma as never,
      costing as never,
    );
  });

  it.each(['ORDER_RESERVATION', 'ORDER_RESERVATION_COMMITTED'])(
    'returns idempotently when a %s reservation already exists',
    async (referenceType) => {
      const findFirst = jest
        .fn()
        .mockResolvedValue({ id: 'reservation-a', referenceType });
      transaction.mockImplementationOnce((callback: (tx: unknown) => unknown) =>
        Promise.resolve(
          callback({
            $queryRaw: rowLock,
            inventoryMovement: { findFirst },
          }),
        ),
      );

      await expect(
        service.reserveStock('order-a', 'tenant-a'),
      ).resolves.toEqual({
        orderId: 'order-a',
        reserved: true,
      });
      expect(findFirst).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-a',
          referenceId: 'order-a',
          referenceType: {
            in: ['ORDER_RESERVATION', 'ORDER_RESERVATION_COMMITTED'],
          },
        },
      });
      expect(rowLock).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects orders missing from the trusted tenant scope', async () => {
    rowLock.mockResolvedValueOnce([]);
    transaction.mockImplementationOnce((callback: (tx: unknown) => unknown) =>
      Promise.resolve(callback({ $queryRaw: rowLock })),
    );

    await expect(service.reserveStock('order-a', 'tenant-a')).rejects.toThrow(
      new BadRequestException('Order not found'),
    );
    expect(rowLock).toHaveBeenCalledTimes(1);
  });

  it('returns false when releasing or committing has no active reservation', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const findFirst = jest.fn().mockResolvedValue({
      id: 'order-a',
      Tenant: { businessType: BusinessType.RETAIL },
    });
    transaction.mockImplementationOnce((callback: (tx: unknown) => unknown) =>
      Promise.resolve(callback({ inventoryMovement: { findMany } })),
    );
    await expect(
      service.releaseReservation('order-a', 'tenant-a'),
    ).resolves.toEqual({ orderId: 'order-a', released: false });

    transaction.mockImplementationOnce((callback: (tx: unknown) => unknown) =>
      Promise.resolve(
        callback({
          salesOrder: { findFirst },
          inventoryMovement: { findMany },
        }),
      ),
    );
    await expect(
      service.commitReservation('order-a', 'tenant-a'),
    ).resolves.toEqual({ orderId: 'order-a', committed: false });
  });

  it('releases through the supplied transaction without opening a nested transaction', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const tx = { inventoryMovement: { findMany } };

    await expect(
      service.releaseReservation('order-a', 'tenant-a', tx as never),
    ).resolves.toEqual({ orderId: 'order-a', released: false });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        referenceId: 'order-a',
        referenceType: 'ORDER_RESERVATION',
      },
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('fails the transaction when stock cannot satisfy a reservation', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const order = {
      id: 'order-a',
      outletId: null,
      Tenant: { businessType: BusinessType.RETAIL },
      SalesOrderItem: [
        {
          quantity: 2,
          Product: {
            inventoryItemId: 'inventory-a',
            InventoryItem: { id: 'inventory-a' },
            Recipe: null,
          },
        },
      ],
    };
    const orderFindFirst = jest.fn().mockResolvedValue(order);
    const stockFindMany = jest.fn().mockResolvedValue([]);
    transaction.mockImplementationOnce((callback: (tx: unknown) => unknown) =>
      Promise.resolve(
        callback({
          $queryRaw: rowLock,
          inventoryMovement: { findFirst },
          salesOrder: { findFirst: orderFindFirst },
          inventoryStock: { findMany: stockFindMany },
        }),
      ),
    );

    await expect(service.reserveStock('order-a', 'tenant-a')).rejects.toThrow(
      'Insufficient stock for order reservation',
    );
    expect(stockFindMany).toHaveBeenCalled();
  });
});
