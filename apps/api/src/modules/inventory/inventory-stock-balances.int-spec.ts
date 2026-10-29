import { PrismaClient } from '@prisma/client';

import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';
import { InventoryReorderRulesDto } from './dto/inventory-reorder-rules.dto';
import { InventoryRepository } from './inventory.repository';
import { ACTIVE_RESERVATION_REF } from './reservation.repository';

const prisma = new PrismaClient();
const repository = new InventoryRepository(prisma as never);

const tenantA = 'it-stock-balance-tenant-a';
const tenantB = 'it-stock-balance-tenant-b';
const itemA = 'it-stock-balance-item-a';
const itemB = 'it-stock-balance-item-b';
const warehouseA = 'it-stock-balance-warehouse-a';
const warehouseC = 'it-stock-balance-warehouse-c';
const warehouseB = 'it-stock-balance-warehouse-b';

async function cleanup() {
  await prisma.inventoryReorderRule.deleteMany({
    where: { inventoryItemId: { in: [itemA, itemB] } },
  });
  await prisma.inventoryMovement.deleteMany({
    where: { inventoryItemId: { in: [itemA, itemB] } },
  });
  await prisma.inventoryStock.deleteMany({
    where: { inventoryItemId: { in: [itemA, itemB] } },
  });
  await prisma.warehouse.deleteMany({
    where: { id: { in: [warehouseA, warehouseB, warehouseC] } },
  });
  await prisma.inventoryItem.deleteMany({
    where: { id: { in: [itemA, itemB] } },
  });
  await prisma.tenant.deleteMany({
    where: { id: { in: [tenantA, tenantB] } },
  });
}

describe('Inventory stock balances PostgreSQL integration', () => {
  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    await prisma.$connect();
    await cleanup();
    await prisma.tenant.createMany({
      data: [
        { id: tenantA, name: 'Stock Balance Tenant A', businessType: 'RETAIL' },
        { id: tenantB, name: 'Stock Balance Tenant B', businessType: 'RETAIL' },
      ],
    });
    await prisma.inventoryItem.createMany({
      data: [
        {
          id: itemA,
          code: 'STOCK-BALANCE-A',
          name: 'Stock Balance Item A',
          type: 'MATERIAL',
          tenantId: tenantA,
        },
        {
          id: itemB,
          code: 'STOCK-BALANCE-B',
          name: 'Stock Balance Item B',
          type: 'MATERIAL',
          tenantId: tenantB,
        },
      ],
    });
    await prisma.warehouse.createMany({
      data: [
        {
          id: warehouseA,
          name: 'Stock Balance Warehouse A',
          code: 'SB-A',
          tenantId: tenantA,
        },
        {
          id: warehouseC,
          name: 'Stock Balance Warehouse C',
          code: 'SB-C',
          tenantId: tenantA,
        },
        {
          id: warehouseB,
          name: 'Stock Balance Warehouse B',
          code: 'SB-B',
          tenantId: tenantB,
        },
      ],
    });
  });

  beforeEach(async () => {
    await prisma.inventoryReorderRule.deleteMany({
      where: { inventoryItemId: { in: [itemA, itemB] } },
    });
    await prisma.inventoryMovement.deleteMany({
      where: { inventoryItemId: { in: [itemA, itemB] } },
    });
    await prisma.inventoryStock.deleteMany({
      where: { inventoryItemId: { in: [itemA, itemB] } },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('returns warehouse balances and unassigned stock without leaking another tenant', async () => {
    const updatedAt = new Date();
    await prisma.inventoryStock.createMany({
      data: [
        {
          warehouseId: warehouseA,
          inventoryItemId: itemA,
          quantity: 5,
          updatedAt,
        },
        {
          warehouseId: warehouseC,
          inventoryItemId: itemA,
          quantity: 3,
          updatedAt,
        },
        { inventoryItemId: itemA, quantity: 2, updatedAt },
        { inventoryItemId: itemA, quantity: 1, updatedAt },
        {
          warehouseId: warehouseB,
          inventoryItemId: itemA,
          quantity: 100,
          updatedAt,
        },
        {
          warehouseId: warehouseC,
          inventoryItemId: itemB,
          quantity: 50,
          updatedAt,
        },
      ],
    });

    const result = await repository.stockBalances(tenantA, itemA);

    expect(result.item).toEqual(
      expect.objectContaining({
        id: itemA,
        code: 'STOCK-BALANCE-A',
        name: 'Stock Balance Item A',
      }),
    );
    expect(result.totalQuantity).toBe(11);
    expect(result.balances).toHaveLength(3);
    expect(
      result.balances
        .map(({ warehouseId, quantity }) => ({ warehouseId, quantity }))
        .sort((a, b) =>
          (a.warehouseId ?? '').localeCompare(b.warehouseId ?? ''),
        ),
    ).toEqual([
      { warehouseId: null, quantity: 3 },
      { warehouseId: warehouseA, quantity: 5 },
      { warehouseId: warehouseC, quantity: 3 },
    ]);
  });

  it('does not disclose stock balances for an inventory item owned by another tenant', async () => {
    await expect(repository.stockBalances(tenantA, itemB)).rejects.toThrow(
      'Inventory item not found',
    );
  });

  it('returns an empty zero balance for an item without stock rows', async () => {
    const result = await repository.stockBalances(tenantA, itemA);
    expect(result.item.id).toBe(itemA);
    expect(result.balances).toEqual([]);
    expect(result.totalQuantity).toBe(0);
  });

  it('reports available, reserved, and on-hand quantities by tenant location', async () => {
    const updatedAt = new Date();
    await prisma.inventoryStock.createMany({
      data: [
        {
          warehouseId: warehouseA,
          inventoryItemId: itemA,
          quantity: 5,
          updatedAt,
        },
        { inventoryItemId: itemA, quantity: 3, updatedAt },
      ],
    });
    await prisma.inventoryMovement.create({
      data: {
        tenantId: tenantA,
        inventoryItemId: itemA,
        warehouseId: warehouseA,
        type: 'STOCK_OUT',
        quantity: 2,
        referenceType: ACTIVE_RESERVATION_REF,
        referenceId: 'order-a',
        note: 'Reserved stock for order',
      },
    });

    const result = await repository.availability(tenantA, itemA);

    expect(result.totals).toEqual({
      availableQuantity: 8,
      reservedQuantity: 2,
      onHandQuantity: 10,
    });
    expect(
      result.balances
        .map(
          ({
            warehouseId,
            availableQuantity,
            reservedQuantity,
            onHandQuantity,
          }) => ({
            warehouseId,
            availableQuantity,
            reservedQuantity,
            onHandQuantity,
          }),
        )
        .sort((a, b) =>
          (a.warehouseId ?? '').localeCompare(b.warehouseId ?? ''),
        ),
    ).toEqual([
      {
        warehouseId: null,
        availableQuantity: 3,
        reservedQuantity: 0,
        onHandQuantity: 3,
      },
      {
        warehouseId: warehouseA,
        availableQuantity: 5,
        reservedQuantity: 2,
        onHandQuantity: 7,
      },
    ]);
  });

  it('does not disclose availability for an item owned by another tenant', async () => {
    await expect(repository.availability(tenantA, itemB)).rejects.toThrow(
      'Inventory item not found',
    );
  });

  it('replaces per-warehouse rules and recommends against available stock', async () => {
    const dto: InventoryReorderRulesDto = {
      scope: 'PER_WAREHOUSE',
      rules: [
        {
          warehouseId: warehouseA,
          reorderPoint: 5,
          quantityStrategy: 'TARGET_STOCK',
          targetStock: 12,
          action: 'ALERT_AND_SUGGEST',
        },
      ],
    };

    await repository.replaceReorderRules(tenantA, itemA, dto);
    const result = await repository.availability(tenantA, itemA);

    const zeroStockBalance = result.balances.find(
      (balance) => balance.warehouseId === warehouseA,
    );
    expect(zeroStockBalance?.availableQuantity).toBe(0);
    expect(zeroStockBalance?.replenishment).toEqual({
      scope: 'PER_WAREHOUSE',
      warehouseId: warehouseA,
      action: 'ALERT_AND_SUGGEST',
      status: 'REORDER_REQUIRED',
      reorderPoint: 5,
      availableQuantity: 0,
      recommendedQuantity: 12,
    });
    expect(result.reorderRules).toHaveLength(1);
  });

  it('keeps tenant-total rules warehouse-independent and rejects foreign warehouses', async () => {
    const dto: InventoryReorderRulesDto = {
      scope: 'TENANT_ITEM_TOTAL',
      rules: [
        {
          reorderPoint: 3,
          quantityStrategy: 'FIXED_QUANTITY',
          fixedOrderQuantity: 8,
          action: 'ALERT_ONLY',
        },
      ],
    };
    await repository.replaceReorderRules(tenantA, itemA, dto);

    const result = await repository.availability(tenantA, itemA);
    expect(result.tenantTotalReplenishment).toEqual(
      expect.objectContaining({
        status: 'REORDER_REQUIRED',
        recommendedQuantity: null,
      }),
    );
    await expect(
      repository.replaceReorderRules(tenantA, itemA, {
        scope: 'PER_WAREHOUSE',
        rules: [
          {
            warehouseId: warehouseB,
            reorderPoint: 1,
            quantityStrategy: 'FIXED_QUANTITY',
            fixedOrderQuantity: 2,
          },
        ],
      }),
    ).rejects.toThrow(
      'Reorder rules can reference only warehouses in this tenant',
    );

    expect(await repository.getReorderRules(tenantA, itemA)).toHaveLength(1);
  });

  it('clears rules when replaced with an empty list', async () => {
    await repository.replaceReorderRules(tenantA, itemA, {
      scope: 'TENANT_ITEM_TOTAL',
      rules: [
        {
          reorderPoint: 0,
          quantityStrategy: 'FIXED_QUANTITY',
          fixedOrderQuantity: 1,
        },
      ],
    });
    await repository.replaceReorderRules(tenantA, itemA, {
      scope: 'TENANT_ITEM_TOTAL',
      rules: [],
    });

    expect(await repository.getReorderRules(tenantA, itemA)).toEqual([]);
  });
});
