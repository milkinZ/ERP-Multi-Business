import { NotFoundException } from '@nestjs/common';

import { WarehouseRepository } from './warehouse.repository';

describe('WarehouseRepository.listStocks', () => {
  const warehouseFindFirst = jest.fn();
  const inventoryStockFindMany = jest.fn();
  const inventoryStockCount = jest.fn();
  let repository: WarehouseRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    warehouseFindFirst.mockResolvedValue({ id: 'warehouse-a' });
    inventoryStockFindMany.mockResolvedValue([
      {
        inventoryItemId: 'item-a',
        quantity: 12,
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        InventoryItem: {
          id: 'item-a',
          code: 'ING-001',
          name: 'Coffee',
          type: 'INGREDIENT',
          unit: 'kg',
        },
      },
    ]);
    inventoryStockCount.mockResolvedValue(21);
    repository = new WarehouseRepository({
      warehouse: { findFirst: warehouseFindFirst },
      inventoryStock: {
        findMany: inventoryStockFindMany,
        count: inventoryStockCount,
      },
    } as never);
  });

  it('returns paginated stock with safe item fields and tenant-scoped item filters', async () => {
    const result = await repository.listStocks('warehouse-a', 'tenant-a', {
      page: 2,
      limit: 10,
      search: 'coffee',
    });

    expect(warehouseFindFirst).toHaveBeenCalledWith({
      where: { id: 'warehouse-a', tenantId: 'tenant-a' },
      select: { id: true },
    });
    const expectedWhere = {
      warehouseId: 'warehouse-a',
      InventoryItem: {
        tenantId: 'tenant-a',
        OR: [
          { name: { contains: 'coffee', mode: 'insensitive' } },
          { code: { contains: 'coffee', mode: 'insensitive' } },
        ],
      },
    };
    expect(inventoryStockFindMany).toHaveBeenCalledWith({
      where: expectedWhere,
      select: {
        inventoryItemId: true,
        quantity: true,
        updatedAt: true,
        InventoryItem: {
          select: { id: true, code: true, name: true, type: true, unit: true },
        },
      },
      orderBy: [{ InventoryItem: { name: 'asc' } }, { inventoryItemId: 'asc' }],
      skip: 10,
      take: 10,
    });
    expect(inventoryStockCount).toHaveBeenCalledWith({ where: expectedWhere });
    expect(result).toEqual({
      data: [
        {
          inventoryItemId: 'item-a',
          code: 'ING-001',
          name: 'Coffee',
          type: 'INGREDIENT',
          unit: 'kg',
          quantity: 12,
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
      pagination: { page: 2, limit: 10, total: 21, totalPages: 3 },
    });
  });

  it('does not query stock for a warehouse outside the tenant', async () => {
    warehouseFindFirst.mockResolvedValue(null);

    await expect(
      repository.listStocks('warehouse-foreign', 'tenant-a', {
        page: 1,
        limit: 20,
      }),
    ).rejects.toThrow(new NotFoundException('Warehouse not found'));
    expect(inventoryStockFindMany).not.toHaveBeenCalled();
    expect(inventoryStockCount).not.toHaveBeenCalled();
  });
});
