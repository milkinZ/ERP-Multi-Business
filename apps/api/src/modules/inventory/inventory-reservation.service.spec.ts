import { BadRequestException } from '@nestjs/common';
import { BusinessType } from '@prisma/client';

import { InventoryReservationService } from './inventory-reservation.service';

describe('InventoryReservationService', () => {
  const transaction = jest.fn();
  const prisma = { $transaction: transaction };
  let service: InventoryReservationService;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      Promise.resolve(callback({})),
    );
    service = new InventoryReservationService(prisma as never);
  });

  it('returns idempotently when an active reservation already exists', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'reservation-a' });
    transaction.mockImplementationOnce((callback: (tx: unknown) => unknown) =>
      Promise.resolve(callback({ inventoryMovement: { findFirst } })),
    );

    await expect(service.reserveStock('order-a', 'tenant-a')).resolves.toEqual({
      orderId: 'order-a',
      reserved: true,
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        referenceId: 'order-a',
        referenceType: 'ORDER_RESERVATION',
      },
    });
  });

  it('rejects orders missing from the trusted tenant scope', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    transaction.mockImplementationOnce((callback: (tx: unknown) => unknown) =>
      Promise.resolve(
        callback({
          inventoryMovement: { findFirst },
          salesOrder: { findFirst },
        }),
      ),
    );

    await expect(service.reserveStock('order-a', 'tenant-a')).rejects.toThrow(
      new BadRequestException('Order not found'),
    );
    const orderLookup = expect.objectContaining({
      where: { id: 'order-a', tenantId: 'tenant-a' },
    }) as unknown as Record<string, unknown>;
    expect(findFirst).toHaveBeenNthCalledWith(2, orderLookup);
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
