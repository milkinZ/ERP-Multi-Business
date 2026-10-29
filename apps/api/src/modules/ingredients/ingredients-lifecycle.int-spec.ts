import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';
import { IngredientsRepository } from './ingredients.repository';
import { IngredientsService } from './ingredients.service';

const prisma = new PrismaClient();
const repository = new IngredientsRepository(prisma as never);
const service = new IngredientsService(prisma as never, repository);

const tenantId = 'it-ingredient-lifecycle-tenant';
const foreignTenantId = 'it-ingredient-lifecycle-foreign';
const inventoryItemId = 'it-ingredient-lifecycle-item';
const unusedInventoryItemId = 'it-ingredient-lifecycle-unused-item';
const warehouseId = 'it-ingredient-lifecycle-warehouse';

async function cleanup() {
  await prisma.inventoryMovement.deleteMany({
    where: { inventoryItemId },
  });
  await prisma.inventoryStock.deleteMany({
    where: { inventoryItemId },
  });
  await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
  await prisma.inventoryItem.deleteMany({
    where: { id: { in: [inventoryItemId, unusedInventoryItemId] } },
  });
  await prisma.tenant.deleteMany({
    where: { id: { in: [tenantId, foreignTenantId] } },
  });
}

describe('Ingredient lifecycle PostgreSQL integration', () => {
  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    await prisma.$connect();
    await cleanup();
    await prisma.tenant.createMany({
      data: [
        { id: tenantId, name: 'Ingredient Lifecycle Tenant' },
        { id: foreignTenantId, name: 'Ingredient Lifecycle Foreign Tenant' },
      ],
    });
    await prisma.inventoryItem.create({
      data: {
        id: inventoryItemId,
        code: 'IT-ING-LIFECYCLE',
        name: 'Lifecycle ingredient',
        unit: 'kg',
        type: 'INGREDIENT',
        tenantId,
      },
    });
    await prisma.inventoryItem.create({
      data: {
        id: unusedInventoryItemId,
        code: 'IT-ING-LIFECYCLE-UNUSED',
        name: 'Unused lifecycle ingredient',
        unit: 'kg',
        type: 'INGREDIENT',
        tenantId,
      },
    });
    await prisma.warehouse.create({
      data: {
        id: warehouseId,
        code: 'IT-ING-LIFECYCLE',
        name: 'Ingredient Lifecycle Warehouse',
        tenantId,
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('updates one inventory record and protects stock history', async () => {
    const updated = await service.update(inventoryItemId, tenantId, {
      name: 'Arabica beans',
      unit: 'g',
      isActive: false,
    });
    expect(updated).toMatchObject({
      id: inventoryItemId,
      name: 'Arabica beans',
      unit: 'g',
      InventoryItem: {
        id: inventoryItemId,
        name: 'Arabica beans',
        unit: 'g',
        isActive: false,
      },
    });

    await prisma.inventoryStock.create({
      data: {
        inventoryItemId,
        warehouseId,
        quantity: 4,
        updatedAt: new Date(),
      },
    });
    await expect(
      service.update(inventoryItemId, tenantId, { unit: 'kg' }),
    ).rejects.toThrow(
      new BadRequestException(
        'Ingredient unit cannot change after stock, movement, or recipe usage exists',
      ),
    );

    await prisma.inventoryStock.deleteMany({ where: { inventoryItemId } });
    await prisma.inventoryMovement.create({
      data: {
        tenantId,
        inventoryItemId,
        type: 'STOCK_IN',
        quantity: 1,
      },
    });
    await expect(
      service.update(inventoryItemId, tenantId, { unit: 'kg' }),
    ).rejects.toThrow(
      new BadRequestException(
        'Ingredient unit cannot change after stock, movement, or recipe usage exists',
      ),
    );

    await expect(service.remove(inventoryItemId, tenantId)).resolves.toEqual({
      success: true,
      deactivated: true,
    });
    await expect(
      prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } }),
    ).resolves.toMatchObject({ isActive: false });
  });

  it('does not allow updating an ingredient from another tenant', async () => {
    await expect(
      service.update(inventoryItemId, foreignTenantId, {
        name: 'Out of scope',
      }),
    ).rejects.toThrow(new NotFoundException('Ingredient not found'));
  });

  it('hard-deletes an ingredient with no references', async () => {
    await expect(
      service.remove(unusedInventoryItemId, tenantId),
    ).resolves.toEqual({ success: true, deactivated: false });
    await expect(
      prisma.inventoryItem.findUnique({
        where: { id: unusedInventoryItemId },
      }),
    ).resolves.toBeNull();
  });
});
