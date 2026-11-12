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
      Tenant: { id: 'tenant-a', businessType: BusinessType.RETAIL },
      SalesOrderItem: [
        {
          quantity: 2,
          Product: {
            id: 'product-a',
            tenantId: 'tenant-a',
            name: 'Product A',
            isActive: true,
            stockMode: 'INVENTORY_ITEM',
            inventoryItemId: 'inventory-a',
            InventoryItem: {
              id: 'inventory-a',
              tenantId: 'tenant-a',
              type: 'PRODUCT',
              isActive: true,
            },
            Recipe: null,
          },
        },
      ],
    };
    const orderFindFirst = jest.fn().mockResolvedValue(order);
    const stockFindMany = jest.fn().mockResolvedValue([]);
    rowLock.mockImplementation(() =>
      Promise.resolve(
        rowLock.mock.calls.length > 4
          ? [{ id: 'inventory-a', name: 'Product A', unit: 'PCS' }]
          : [{ id: 'order-a' }],
      ),
    );
    transaction.mockImplementationOnce((callback: (tx: unknown) => unknown) =>
      Promise.resolve(
        callback({
          $queryRaw: rowLock,
          inventoryMovement: { findFirst },
          salesOrder: { findFirst: orderFindFirst },
          inventoryStock: { findMany: stockFindMany },
          tenantUnitConversion: {
            findMany: jest.fn().mockResolvedValue([]),
          },
          inventoryUnitConversion: {
            findMany: jest.fn().mockResolvedValue([]),
          },
        }),
      ),
    );

    await expect(service.reserveStock('order-a', 'tenant-a')).rejects.toThrow(
      'Insufficient stock for Product A: required 2 PCS, available 0 PCS',
    );
    expect(stockFindMany).toHaveBeenCalled();
  });

  it('rejects cafe recipe-mode products without an active recipe', async () => {
    const order = {
      id: 'order-a',
      outletId: null,
      Tenant: { id: 'tenant-a', businessType: BusinessType.CAFE },
      SalesOrderItem: [
        {
          id: 'order-item-a',
          quantity: 1,
          Product: {
            id: 'product-a',
            tenantId: 'tenant-a',
            name: 'Menu A',
            isActive: true,
            stockMode: 'RECIPE',
            inventoryItemId: null,
            InventoryItem: null,
            Recipe: null,
          },
        },
      ],
    };
    const orderFindFirst = jest.fn().mockResolvedValue(order);
    const findFirst = jest.fn().mockResolvedValue(null);
    rowLock.mockResolvedValue([{ id: 'order-a' }]);
    transaction.mockImplementationOnce((callback: (tx: unknown) => unknown) =>
      Promise.resolve(
        callback({
          $queryRaw: rowLock,
          inventoryMovement: { findFirst },
          salesOrder: { findFirst: orderFindFirst },
          salesOrderRecipeSnapshot: {
            findUnique: jest.fn().mockResolvedValue(null),
          },
        }),
      ),
    );

    await expect(service.reserveStock('order-a', 'tenant-a')).rejects.toThrow(
      'Product Menu A requires an active recipe before it can be confirmed',
    );
  });

  it('does not create inventory requirements for explicitly untracked products', async () => {
    const inventoryMovementCreate = jest.fn();
    const order = {
      id: 'order-a',
      outletId: null,
      Tenant: { id: 'tenant-a', businessType: BusinessType.RETAIL },
      SalesOrderItem: [
        {
          id: 'order-item-a',
          quantity: 1,
          Product: {
            id: 'product-a',
            tenantId: 'tenant-a',
            name: 'Service fee',
            isActive: true,
            stockMode: 'UNTRACKED',
            inventoryItemId: null,
            InventoryItem: null,
            Recipe: null,
          },
        },
      ],
    };
    const orderFindFirst = jest.fn().mockResolvedValue(order);
    const findFirst = jest.fn().mockResolvedValue(null);
    transaction.mockImplementationOnce((callback: (tx: unknown) => unknown) =>
      Promise.resolve(
        callback({
          $queryRaw: rowLock,
          inventoryMovement: {
            findFirst,
            create: inventoryMovementCreate,
          },
          salesOrder: { findFirst: orderFindFirst },
          tenantUnitConversion: {
            findMany: jest.fn().mockResolvedValue([]),
          },
          inventoryUnitConversion: {
            findMany: jest.fn().mockResolvedValue([]),
          },
        }),
      ),
    );

    await expect(service.reserveStock('order-a', 'tenant-a')).resolves.toEqual({
      orderId: 'order-a',
      reserved: true,
    });
    expect(inventoryMovementCreate).not.toHaveBeenCalled();
  });

  it('reserves the confirmed recipe snapshot using its captured units and quantities', async () => {
    const inventoryMovementCreate = jest.fn().mockResolvedValue({});
    const stockUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const stockFindMany = jest.fn().mockResolvedValue([
      {
        id: 'stock-a',
        warehouseId: 'warehouse-a',
        quantity: 1000,
        createdAt: new Date(),
      },
    ]);
    const order = {
      id: 'order-a',
      outletId: null,
      Tenant: { id: 'tenant-a', businessType: BusinessType.CAFE },
      SalesOrderItem: [
        {
          id: 'order-item-a',
          quantity: 2,
          Product: {
            id: 'product-a',
            tenantId: 'tenant-a',
            name: 'Cafe menu',
            isActive: true,
            stockMode: 'RECIPE',
            inventoryItemId: null,
            InventoryItem: null,
            Recipe: {
              id: 'recipe-a',
              tenantId: 'tenant-a',
              revision: 3,
              isActive: true,
              RecipeItem: [
                {
                  quantity: 99,
                  unit: 'g',
                  InventoryItem: {
                    id: 'ingredient-a',
                    name: 'Flour',
                    unit: 'g',
                    tenantId: 'tenant-a',
                    type: 'INGREDIENT',
                    isActive: true,
                  },
                },
              ],
            },
          },
        },
      ],
    };
    const orderFindFirst = jest.fn().mockResolvedValue(order);
    const findFirst = jest.fn().mockResolvedValue(null);
    rowLock.mockImplementation(() =>
      Promise.resolve(
        rowLock.mock.calls.length > 4
          ? [{ id: 'ingredient-a', name: 'Flour', unit: 'g' }]
          : [{ id: 'order-a' }],
      ),
    );
    transaction.mockImplementationOnce((callback: (tx: unknown) => unknown) =>
      Promise.resolve(
        callback({
          $queryRaw: rowLock,
          inventoryMovement: {
            findFirst,
            create: inventoryMovementCreate,
          },
          salesOrder: { findFirst: orderFindFirst },
          salesOrderRecipeSnapshot: {
            findUnique: jest.fn().mockResolvedValue({
              tenantId: 'tenant-a',
              recipeId: 'recipe-a',
              Items: [
                {
                  inventoryItemId: 'ingredient-a',
                  quantity: 0.25,
                  unit: 'kg',
                  inventoryUnit: 'g',
                },
              ],
            }),
          },
          tenantUnitConversion: {
            findMany: jest.fn().mockResolvedValue([]),
          },
          inventoryUnitConversion: {
            findMany: jest.fn().mockResolvedValue([]),
          },
          inventoryStock: {
            findMany: stockFindMany,
            updateMany: stockUpdateMany,
          },
        }),
      ),
    );

    await expect(service.reserveStock('order-a', 'tenant-a')).resolves.toEqual({
      orderId: 'order-a',
      reserved: true,
    });
    expect(stockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: { decrement: 500 } } }),
    );
    expect(inventoryMovementCreate).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-a',
        warehouseId: 'warehouse-a',
        inventoryItemId: 'ingredient-a',
        type: 'STOCK_OUT',
        referenceType: 'ORDER_RESERVATION',
        referenceId: 'order-a',
        quantity: 500,
        unit: 'g',
        beforeQuantity: 1000,
        afterQuantity: 500,
        note: 'Reserved stock for order',
      },
    });
  });
});
