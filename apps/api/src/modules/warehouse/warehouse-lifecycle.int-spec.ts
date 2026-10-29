import { PrismaClient } from '@prisma/client';

import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';
import { InventoryRepository } from '../inventory/inventory.repository';
import { WarehouseTransferService } from '../inventory/warehouse-transfer.service';
import { WarehouseRepository } from './warehouse.repository';
import { WarehouseService } from './warehouse.service';

const prisma = new PrismaClient();
const inventoryRepository = new InventoryRepository(prisma as never);
const warehouseTransferService = new WarehouseTransferService(prisma as never);
const service = new WarehouseService(new WarehouseRepository(prisma as never));

const tenantId = 'it-warehouse-lifecycle-tenant';
const warehouseInUseId = 'it-warehouse-lifecycle-in-use';
const unusedWarehouseId = 'it-warehouse-lifecycle-unused';
const activeWarehouseId = 'it-warehouse-lifecycle-active';
const inventoryItemId = 'it-warehouse-lifecycle-item';

async function cleanup() {
  await prisma.inventoryStock.deleteMany({
    where: {
      warehouseId: {
        in: [warehouseInUseId, unusedWarehouseId, activeWarehouseId],
      },
    },
  });
  await prisma.warehouse.deleteMany({
    where: {
      id: { in: [warehouseInUseId, unusedWarehouseId, activeWarehouseId] },
    },
  });
  await prisma.inventoryItem.deleteMany({ where: { id: inventoryItemId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

describe('Warehouse lifecycle PostgreSQL integration', () => {
  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    await prisma.$connect();
    await cleanup();
    await prisma.tenant.create({
      data: { id: tenantId, name: 'Warehouse Lifecycle Tenant' },
    });
    await prisma.inventoryItem.create({
      data: {
        id: inventoryItemId,
        code: 'IT-WH-LIFECYCLE',
        name: 'Warehouse lifecycle item',
        type: 'MATERIAL',
        tenantId,
      },
    });
    await prisma.warehouse.createMany({
      data: [
        {
          id: warehouseInUseId,
          name: 'Warehouse with stock',
          code: 'IT-WH-IN-USE',
          tenantId,
        },
        {
          id: unusedWarehouseId,
          name: 'Unused warehouse',
          code: 'IT-WH-UNUSED',
          tenantId,
        },
        {
          id: activeWarehouseId,
          name: 'Active warehouse',
          code: 'IT-WH-ACTIVE',
          tenantId,
        },
      ],
    });
    await prisma.inventoryStock.create({
      data: {
        warehouseId: warehouseInUseId,
        inventoryItemId,
        quantity: 0,
        updatedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('deactivates a warehouse referenced by stock and preserves its record', async () => {
    await expect(service.remove(warehouseInUseId, tenantId)).resolves.toEqual({
      id: warehouseInUseId,
      deleted: false,
      deactivated: true,
    });
    await expect(
      prisma.warehouse.findUnique({ where: { id: warehouseInUseId } }),
    ).resolves.toMatchObject({ id: warehouseInUseId, isActive: false });
  });

  it('rejects new stock movements and transfers using an inactive warehouse', async () => {
    await expect(
      inventoryRepository.stockIn(
        tenantId,
        { inventoryItemId, warehouseId: warehouseInUseId, quantity: 1 },
        'integration-user',
      ),
    ).rejects.toThrow(
      'Inactive warehouses cannot receive new inventory movements',
    );

    await expect(
      warehouseTransferService.create(
        tenantId,
        'integration-user',
        'inactive-warehouse-transfer',
        {
          sourceWarehouseId: warehouseInUseId,
          destinationWarehouseId: activeWarehouseId,
          items: [{ inventoryItemId, quantity: 1 }],
        },
      ),
    ).rejects.toThrow('Inactive warehouses cannot be used for new transfers');
  });

  it('permanently deletes a warehouse with no operational references', async () => {
    await expect(service.remove(unusedWarehouseId, tenantId)).resolves.toEqual({
      id: unusedWarehouseId,
      deleted: true,
      deactivated: false,
    });
    await expect(
      prisma.warehouse.findUnique({ where: { id: unusedWarehouseId } }),
    ).resolves.toBeNull();
  });
});
