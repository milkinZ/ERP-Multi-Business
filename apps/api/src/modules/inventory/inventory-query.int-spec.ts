import { PrismaClient } from '@prisma/client';

import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';
import { InventoryRepository } from './inventory.repository';

const prisma = new PrismaClient();
const repository = new InventoryRepository(prisma as never);

const tenantA = 'it-inventory-query-tenant-a';
const tenantB = 'it-inventory-query-tenant-b';
const itemA = 'it-inventory-query-item-a';
const itemB = 'it-inventory-query-item-b';
const itemC = 'it-inventory-query-item-c';
const itemOtherTenant = 'it-inventory-query-item-other';
const warehouseA = 'it-inventory-query-warehouse-a';
const warehouseB = 'it-inventory-query-warehouse-b';
const warehouseOtherTenant = 'it-inventory-query-warehouse-other';

async function cleanup() {
  const itemIds = [itemA, itemB, itemC, itemOtherTenant];
  const warehouseIds = [warehouseA, warehouseB, warehouseOtherTenant];
  await prisma.inventoryMovement.deleteMany({
    where: { inventoryItemId: { in: itemIds } },
  });
  await prisma.inventoryStock.deleteMany({
    where: { inventoryItemId: { in: itemIds } },
  });
  await prisma.warehouse.deleteMany({
    where: { id: { in: warehouseIds } },
  });
  await prisma.inventoryItem.deleteMany({ where: { id: { in: itemIds } } });
  await prisma.tenant.deleteMany({
    where: { id: { in: [tenantA, tenantB] } },
  });
}

describe('Inventory query PostgreSQL integration', () => {
  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    await prisma.$connect();
    await cleanup();
    await prisma.tenant.createMany({
      data: [
        {
          id: tenantA,
          name: 'Inventory Query Tenant A',
          businessType: 'RETAIL',
        },
        {
          id: tenantB,
          name: 'Inventory Query Tenant B',
          businessType: 'RETAIL',
        },
      ],
    });
    await prisma.inventoryItem.createMany({
      data: [
        {
          id: itemA,
          code: 'IQ-A',
          name: 'Coffee Beans',
          type: 'INGREDIENT',
          tenantId: tenantA,
          createdAt: new Date('2026-01-02T00:00:00Z'),
        },
        {
          id: itemB,
          code: 'IQ-B',
          name: 'Coffee Cups',
          type: 'SUPPLY',
          tenantId: tenantA,
          createdAt: new Date('2026-01-02T00:00:00Z'),
        },
        {
          id: itemC,
          code: 'IQ-C',
          name: 'Tea Leaves',
          type: 'INGREDIENT',
          tenantId: tenantA,
          createdAt: new Date('2026-01-03T00:00:00Z'),
        },
        {
          id: itemOtherTenant,
          code: 'IQ-X',
          name: 'Coffee Beans Other Tenant',
          type: 'INGREDIENT',
          tenantId: tenantB,
          createdAt: new Date('2026-01-04T00:00:00Z'),
        },
      ],
    });
    await prisma.warehouse.createMany({
      data: [
        {
          id: warehouseA,
          name: 'Inventory Query Warehouse A',
          code: 'IQ-WA',
          tenantId: tenantA,
        },
        {
          id: warehouseB,
          name: 'Inventory Query Warehouse B',
          code: 'IQ-WB',
          tenantId: tenantA,
        },
        {
          id: warehouseOtherTenant,
          name: 'Inventory Query Warehouse Other',
          code: 'IQ-WX',
          tenantId: tenantB,
        },
      ],
    });
  });

  beforeEach(async () => {
    await prisma.inventoryMovement.deleteMany({
      where: {
        inventoryItemId: { in: [itemA, itemB, itemC, itemOtherTenant] },
      },
    });
    await prisma.inventoryStock.deleteMany({
      where: {
        inventoryItemId: { in: [itemA, itemB, itemC, itemOtherTenant] },
      },
    });
    await prisma.inventoryStock.createMany({
      data: [
        {
          inventoryItemId: itemA,
          warehouseId: warehouseA,
          quantity: 4,
          updatedAt: new Date(),
        },
        {
          inventoryItemId: itemB,
          warehouseId: warehouseA,
          quantity: 3,
          updatedAt: new Date(),
        },
        {
          inventoryItemId: itemC,
          warehouseId: warehouseB,
          quantity: 2,
          updatedAt: new Date(),
        },
        {
          inventoryItemId: itemOtherTenant,
          warehouseId: warehouseOtherTenant,
          quantity: 100,
          updatedAt: new Date(),
        },
      ],
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('searches, filters, and paginates tenant-scoped inventory deterministically', async () => {
    const firstPage = await repository.listInventoryItems(tenantA, {
      search: 'coffee',
      page: 1,
      limit: 1,
    });
    const secondPage = await repository.listInventoryItems(tenantA, {
      search: 'coffee',
      page: 2,
      limit: 1,
    });

    expect(firstPage.data.map((item) => item.id)).toEqual([itemB]);
    expect(secondPage.data.map((item) => item.id)).toEqual([itemA]);
    expect(firstPage.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });

    const nameSorted = await repository.listInventoryItems(tenantA, {
      search: 'coffee',
      sortBy: 'name',
      sortOrder: 'asc',
      page: 1,
      limit: 20,
    });
    expect(nameSorted.data.map((item) => item.id)).toEqual([itemA, itemB]);

    const combinedFilters = await repository.listInventoryItems(tenantA, {
      search: 'coffee',
      type: 'INGREDIENT',
      warehouseId: warehouseA,
      page: 1,
      limit: 20,
    });
    expect(combinedFilters.data.map((item) => item.id)).toEqual([itemA]);

    const warehouseResult = await repository.listInventoryItems(tenantA, {
      warehouseId: warehouseA,
      page: 1,
      limit: 20,
    });
    expect(warehouseResult.data.map((item) => item.id).sort()).toEqual(
      [itemA, itemB].sort(),
    );
    expect(warehouseResult.pagination.total).toBe(2);
  });

  it('filters movement history by search, type, warehouse, and tenant', async () => {
    await prisma.inventoryMovement.createMany({
      data: [
        {
          id: 'it-inventory-query-movement-a',
          tenantId: tenantA,
          inventoryItemId: itemA,
          warehouseId: warehouseA,
          type: 'STOCK_IN',
          quantity: 4,
          note: 'Morning delivery',
          createdAt: new Date('2026-01-05T00:00:00Z'),
        },
        {
          id: 'it-inventory-query-movement-b',
          tenantId: tenantA,
          inventoryItemId: itemB,
          warehouseId: warehouseA,
          type: 'WASTE',
          quantity: 1,
          note: 'Damaged cups',
        },
        {
          id: 'it-inventory-query-movement-d',
          tenantId: tenantA,
          inventoryItemId: itemB,
          warehouseId: warehouseA,
          type: 'STOCK_IN',
          quantity: 1,
          note: 'Evening delivery',
          createdAt: new Date('2026-01-05T00:00:00Z'),
        },
        {
          id: 'it-inventory-query-movement-c',
          tenantId: tenantA,
          inventoryItemId: itemC,
          warehouseId: warehouseB,
          type: 'STOCK_IN',
          quantity: 2,
          note: 'Tea delivery',
        },
        {
          id: 'it-inventory-query-movement-other',
          tenantId: tenantB,
          inventoryItemId: itemOtherTenant,
          warehouseId: warehouseOtherTenant,
          type: 'STOCK_IN',
          quantity: 100,
          note: 'Other tenant coffee',
        },
      ],
    });

    const firstPage = await repository.history(tenantA, {
      search: 'DELIVERY',
      type: 'STOCK_IN',
      warehouseId: warehouseA,
      page: 1,
      limit: 1,
    });
    const secondPage = await repository.history(tenantA, {
      search: 'DELIVERY',
      type: 'STOCK_IN',
      warehouseId: warehouseA,
      page: 2,
      limit: 1,
    });

    expect(firstPage.data.map((movement) => movement.id)).toEqual([
      'it-inventory-query-movement-d',
    ]);
    expect(secondPage.data.map((movement) => movement.id)).toEqual([
      'it-inventory-query-movement-a',
    ]);
    expect(firstPage.pagination.total).toBe(2);
    expect(firstPage.pagination.totalPages).toBe(2);

    const itemHistory = await repository.historyByItem(tenantA, itemA, {
      page: 1,
      limit: 20,
      sortBy: 'quantity',
      sortOrder: 'asc',
    });
    expect(itemHistory.data.map((movement) => movement.id)).toEqual([
      'it-inventory-query-movement-a',
    ]);

    const quantitySorted = await repository.history(tenantA, {
      warehouseId: warehouseA,
      sortBy: 'quantity',
      sortOrder: 'asc',
      page: 1,
      limit: 20,
    });
    expect(quantitySorted.data.map((movement) => movement.id)).toEqual([
      'it-inventory-query-movement-b',
      'it-inventory-query-movement-d',
      'it-inventory-query-movement-a',
    ]);
  });

  it('rejects warehouse filters that belong to another tenant', async () => {
    await expect(
      repository.listInventoryItems(tenantA, {
        warehouseId: warehouseOtherTenant,
      }),
    ).rejects.toThrow('Warehouse not found');
    await expect(
      repository.history(tenantA, { warehouseId: warehouseOtherTenant }),
    ).rejects.toThrow('Warehouse not found');
  });
});
