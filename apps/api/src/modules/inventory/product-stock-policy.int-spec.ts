import { PrismaClient, ProductStockMode } from '@prisma/client';

import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';
import { InventoryReservationService } from './inventory-reservation.service';

describe('Product stock policy PostgreSQL integration', () => {
  const prisma = new PrismaClient();
  const reservations = new InventoryReservationService(prisma as never);
  const tenantId = 'it-stock-policy-tenant';
  const warehouseId = 'it-stock-policy-warehouse';
  const ingredientId = 'it-stock-policy-ingredient';
  const recipeProductId = 'it-stock-policy-recipe-product';
  const missingRecipeProductId = 'it-stock-policy-missing-recipe-product';
  const recipeId = 'it-stock-policy-recipe';
  const recipeItemId = 'it-stock-policy-recipe-item';
  const orderId = 'it-stock-policy-order';

  async function cleanup() {
    await prisma.inventoryMovement.deleteMany({ where: { tenantId } });
    await prisma.salesOrderItem.deleteMany({ where: { orderId } });
    await prisma.salesOrder.deleteMany({ where: { id: orderId } });
    await prisma.inventoryStock.deleteMany({
      where: { inventoryItemId: ingredientId },
    });
    await prisma.recipeItem.deleteMany({ where: { recipeId } });
    await prisma.recipe.deleteMany({ where: { id: recipeId } });
    await prisma.product.deleteMany({
      where: {
        id: { in: [recipeProductId, missingRecipeProductId] },
      },
    });
    await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
    await prisma.inventoryItem.deleteMany({ where: { id: ingredientId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }

  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    await prisma.$connect();
    await cleanup();
    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: 'Stock Policy Integration Tenant',
        businessType: 'CAFE',
      },
    });
    await prisma.warehouse.create({
      data: {
        id: warehouseId,
        name: 'Stock Policy Warehouse',
        code: 'STOCK-POLICY',
        tenantId,
      },
    });
    await prisma.inventoryItem.create({
      data: {
        id: ingredientId,
        code: 'STOCK-POLICY-INGREDIENT',
        name: 'Flour',
        type: 'INGREDIENT',
        unit: 'g',
        tenantId,
      },
    });
    await prisma.product.createMany({
      data: [
        {
          id: recipeProductId,
          name: 'Recipe Menu',
          sku: 'STOCK-POLICY-RECIPE',
          price: 250,
          tenantId,
          stockMode: ProductStockMode.RECIPE,
        },
        {
          id: missingRecipeProductId,
          name: 'Menu Without Recipe',
          sku: 'STOCK-POLICY-NO-RECIPE',
          price: 250,
          tenantId,
          stockMode: ProductStockMode.RECIPE,
        },
      ],
    });
    await prisma.recipe.create({
      data: {
        id: recipeId,
        tenantId,
        productId: recipeProductId,
        RecipeItem: {
          create: {
            id: recipeItemId,
            inventoryItemId: ingredientId,
            quantity: 0.025,
            unit: 'kg',
          },
        },
      },
    });
    await prisma.inventoryStock.create({
      data: {
        warehouseId,
        inventoryItemId: ingredientId,
        quantity: 1000,
        updatedAt: new Date(),
      },
    });
  });

  afterEach(async () => {
    await prisma.inventoryMovement.deleteMany({ where: { tenantId } });
    await prisma.salesOrderItem.deleteMany({ where: { orderId } });
    await prisma.salesOrder.deleteMany({ where: { id: orderId } });
    await prisma.inventoryStock.updateMany({
      where: { inventoryItemId: ingredientId },
      data: { quantity: 1000 },
    });
    await prisma.recipeItem.updateMany({
      where: { id: recipeItemId },
      data: { quantity: 0.025 },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  async function createOrder(productId: string) {
    await prisma.salesOrder.create({
      data: {
        id: orderId,
        orderNumber: orderId,
        status: 'PAID',
        totalAmount: 500,
        tenantId,
        SalesOrderItem: {
          create: {
            productId,
            quantity: 2,
            price: 250,
            subtotal: 500,
          },
        },
      },
    });
  }

  it('reserves converted ingredient stock from an immutable recipe snapshot', async () => {
    await createOrder(recipeProductId);

    await reservations.reserveStock(orderId, tenantId);

    const snapshot = await prisma.salesOrderRecipeSnapshot.findFirstOrThrow({
      where: { tenantId, SalesOrderItem: { orderId } },
      include: { Items: true },
    });
    expect(snapshot.Items).toEqual([
      expect.objectContaining({
        inventoryItemId: ingredientId,
        quantity: 0.025,
        unit: 'kg',
        inventoryUnit: 'g',
      }),
    ]);
    await expect(
      prisma.inventoryStock.findUniqueOrThrow({
        where: {
          warehouseId_inventoryItemId: {
            warehouseId,
            inventoryItemId: ingredientId,
          },
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ quantity: 950 }));

    await prisma.recipeItem.update({
      where: { id: recipeItemId },
      data: { quantity: 0.5 },
    });
    await reservations.releaseReservation(orderId, tenantId);
    await reservations.reserveStock(orderId, tenantId);

    await expect(
      prisma.inventoryStock.findUniqueOrThrow({
        where: {
          warehouseId_inventoryItemId: {
            warehouseId,
            inventoryItemId: ingredientId,
          },
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ quantity: 950 }));
    await expect(
      prisma.salesOrderRecipeSnapshotItem.findMany({
        where: { snapshotId: snapshot.id },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        quantity: 0.025,
        unit: 'kg',
        inventoryUnit: 'g',
      }),
    ]);
  });

  it('rejects a recipe-tracked menu without an active recipe', async () => {
    await createOrder(missingRecipeProductId);

    await expect(reservations.reserveStock(orderId, tenantId)).rejects.toThrow(
      'Product Menu Without Recipe requires an active recipe before it can be confirmed',
    );
    await expect(
      prisma.inventoryMovement.findMany({ where: { referenceId: orderId } }),
    ).resolves.toHaveLength(0);
    await expect(
      prisma.salesOrderRecipeSnapshot.count({
        where: { tenantId, SalesOrderItem: { orderId } },
      }),
    ).resolves.toBe(0);
  });

  it('rolls back recipe snapshots when ingredient stock is insufficient', async () => {
    await prisma.inventoryStock.update({
      where: {
        warehouseId_inventoryItemId: {
          warehouseId,
          inventoryItemId: ingredientId,
        },
      },
      data: { quantity: 20 },
    });
    await createOrder(recipeProductId);

    await expect(reservations.reserveStock(orderId, tenantId)).rejects.toThrow(
      'Insufficient stock for Flour: required 50 g, available 20 g',
    );
    await expect(
      prisma.inventoryMovement.findMany({ where: { referenceId: orderId } }),
    ).resolves.toHaveLength(0);
    await expect(
      prisma.salesOrderRecipeSnapshot.count({
        where: { tenantId, SalesOrderItem: { orderId } },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.inventoryStock.findUniqueOrThrow({
        where: {
          warehouseId_inventoryItemId: {
            warehouseId,
            inventoryItemId: ingredientId,
          },
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ quantity: 20 }));
  });
});
