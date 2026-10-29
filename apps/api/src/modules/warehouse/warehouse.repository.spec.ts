import { Prisma } from '@prisma/client';

import { WarehouseRepository } from './warehouse.repository';

describe('WarehouseRepository', () => {
  const outletFindFirst = jest.fn<
    Promise<{ id: string } | null>,
    [Prisma.OutletFindFirstArgs]
  >();
  const warehouseCreate = jest.fn<
    Promise<{
      id: string;
      tenantId: string;
      name: string;
      code: string;
      outletId: string | null;
      isActive: boolean;
      createdAt: Date;
    }>,
    [Prisma.WarehouseCreateArgs]
  >();
  const warehouseUpdateMany = jest.fn<
    Promise<{ count: number }>,
    [Prisma.WarehouseUpdateManyArgs]
  >();
  const warehouseDelete = jest.fn<
    Promise<unknown>,
    [Prisma.WarehouseDeleteArgs]
  >();
  const warehouseFindFirst = jest.fn<
    Promise<{
      id: string;
      tenantId: string;
      name: string;
      code: string;
      outletId: string | null;
      isActive: boolean;
      createdAt: Date;
    } | null>,
    [Prisma.WarehouseFindFirstArgs]
  >();
  const movementCount = jest.fn<
    Promise<number>,
    [Prisma.InventoryMovementCountArgs]
  >();
  const stockCount = jest.fn<
    Promise<number>,
    [Prisma.InventoryStockCountArgs]
  >();
  const purchaseOrderCount = jest.fn<
    Promise<number>,
    [Prisma.PurchaseOrderCountArgs]
  >();
  const transferCount = jest.fn<
    Promise<number>,
    [Prisma.WarehouseTransferCountArgs]
  >();
  const transactionClient = {
    outlet: { findFirst: outletFindFirst },
    warehouse: {
      create: warehouseCreate,
      updateMany: warehouseUpdateMany,
      findFirst: warehouseFindFirst,
      delete: warehouseDelete,
    },
    inventoryMovement: { count: movementCount },
    inventoryStock: { count: stockCount },
    purchaseOrder: { count: purchaseOrderCount },
    warehouseTransfer: { count: transferCount },
  } as unknown as Prisma.TransactionClient;
  const transaction = jest.fn(
    (
      callback: (tx: Prisma.TransactionClient) => unknown,
      options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
    ) => {
      void options;
      return Promise.resolve(callback(transactionClient));
    },
  );
  let repository: WarehouseRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    outletFindFirst.mockResolvedValue({ id: 'outlet-a' });
    warehouseCreate.mockResolvedValue({
      id: 'warehouse-a',
      tenantId: 'tenant-a',
      name: 'Main',
      code: 'WH-001',
      outletId: 'outlet-a',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    warehouseUpdateMany.mockResolvedValue({ count: 1 });
    warehouseDelete.mockResolvedValue({ id: 'warehouse-a' });
    warehouseFindFirst.mockResolvedValue({
      id: 'warehouse-a',
      tenantId: 'tenant-a',
      name: 'Updated',
      code: 'WH-001',
      outletId: 'outlet-a',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    movementCount.mockResolvedValue(0);
    stockCount.mockResolvedValue(0);
    purchaseOrderCount.mockResolvedValue(0);
    transferCount.mockResolvedValue(0);
    repository = new WarehouseRepository({
      $transaction: transaction,
    } as never);
  });

  it('creates a warehouse only for an active outlet owned by the tenant', async () => {
    await repository.create({
      id: 'warehouse-a',
      tenantId: 'tenant-a',
      name: 'Main',
      code: 'WH-001',
      outletId: 'outlet-a',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });

    expect(outletFindFirst).toHaveBeenCalledWith({
      where: { id: 'outlet-a', tenantId: 'tenant-a', deletedAt: null },
      select: { id: true },
    });
    expect(warehouseCreate.mock.calls[0]?.[0].data.tenantId).toBe('tenant-a');
    expect(transaction.mock.calls[0]?.[1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('rejects cross-tenant or deleted outlets without creating a warehouse', async () => {
    outletFindFirst.mockResolvedValueOnce(null);

    await expect(
      repository.create({
        id: 'warehouse-a',
        tenantId: 'tenant-a',
        name: 'Main',
        code: 'WH-001',
        outletId: 'outlet-foreign',
        isActive: true,
        createdAt: new Date(),
      }),
    ).rejects.toThrow('Outlet not found');
    expect(warehouseCreate).not.toHaveBeenCalled();
  });

  it('updates warehouse data within tenant scope and validates a new outlet', async () => {
    await repository.update('warehouse-a', 'tenant-a', {
      name: 'Updated',
      outletId: 'outlet-a',
    });

    expect(warehouseUpdateMany).toHaveBeenCalledWith({
      where: { id: 'warehouse-a', tenantId: 'tenant-a' },
      data: { name: 'Updated', outletId: 'outlet-a', isActive: undefined },
    });
    expect(warehouseFindFirst).toHaveBeenCalledWith({
      where: { id: 'warehouse-a', tenantId: 'tenant-a' },
    });
  });

  it('deactivates a warehouse when operational history references it', async () => {
    movementCount.mockResolvedValue(1);

    await expect(repository.remove('warehouse-a', 'tenant-a')).resolves.toEqual(
      {
        id: 'warehouse-a',
        deleted: false,
        deactivated: true,
      },
    );
    expect(warehouseUpdateMany).toHaveBeenCalledWith({
      where: { id: 'warehouse-a', tenantId: 'tenant-a' },
      data: { isActive: false },
    });
    expect(warehouseDelete).not.toHaveBeenCalled();
  });

  it('permanently deletes a warehouse without operational history', async () => {
    await expect(repository.remove('warehouse-a', 'tenant-a')).resolves.toEqual(
      {
        id: 'warehouse-a',
        deleted: true,
        deactivated: false,
      },
    );
    expect(warehouseDelete).toHaveBeenCalledWith({
      where: { id: 'warehouse-a' },
    });
    expect(warehouseUpdateMany).not.toHaveBeenCalled();
  });
});
