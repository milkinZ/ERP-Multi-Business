import { PrismaClient } from '@prisma/client';

import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';
import { InventoryRepository } from './inventory.repository';

describe('InventoryRepository fulfillment integration', () => {
  const prisma = new PrismaClient();
  const repository = new InventoryRepository(prisma as never);
  const tenantA = 'it-fulfillment-tenant-a';
  const tenantB = 'it-fulfillment-tenant-b';
  const warehouseA = 'it-fulfillment-warehouse-a';
  const itemA = 'it-fulfillment-item-a';
  const productA = 'it-fulfillment-product-a';
  const orderA = 'it-fulfillment-order-a';
  const orderB = 'it-fulfillment-order-b';

  async function cleanup() {
    await prisma.inventoryMovement.deleteMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
    await prisma.salesOrderItem.deleteMany({
      where: { orderId: { in: [orderA, orderB] } },
    });
    await prisma.salesOrder.deleteMany({
      where: { id: { in: [orderA, orderB] } },
    });
    await prisma.inventoryStock.deleteMany({
      where: { inventoryItemId: itemA },
    });
    await prisma.product.deleteMany({
      where: { id: productA },
    });
    await prisma.inventoryItem.deleteMany({
      where: { id: itemA },
    });
    await prisma.warehouse.deleteMany({
      where: { id: warehouseA },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantA, tenantB] } },
    });
  }

  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    await prisma.$connect();
    await cleanup();
    await prisma.tenant.createMany({
      data: [
        { id: tenantA, name: 'Fulfillment Tenant A', businessType: 'RETAIL' },
        { id: tenantB, name: 'Fulfillment Tenant B', businessType: 'RETAIL' },
      ],
    });
    await prisma.warehouse.create({
      data: {
        id: warehouseA,
        name: 'Warehouse A',
        code: 'FULFILL-A',
        tenantId: tenantA,
      },
    });
    await prisma.inventoryItem.create({
      data: {
        id: itemA,
        code: 'ITEM-A',
        name: 'Product Stock A',
        type: 'PRODUCT',
        tenantId: tenantA,
      },
    });
    await prisma.product.create({
      data: {
        id: productA,
        name: 'Product A',
        sku: 'FULFILL-A',
        price: 100,
        tenantId: tenantA,
        inventoryItemId: itemA,
      },
    });
  });

  afterEach(async () => {
    await prisma.inventoryMovement.deleteMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
    await prisma.salesOrderItem.deleteMany({
      where: { orderId: { in: [orderA, orderB] } },
    });
    await prisma.salesOrder.deleteMany({
      where: { id: { in: [orderA, orderB] } },
    });
    await prisma.inventoryStock.deleteMany({
      where: { inventoryItemId: itemA },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  async function createPaidOrder(id: string, tenantId: string) {
    await prisma.salesOrder.create({
      data: {
        id,
        orderNumber: id,
        status: 'PAID',
        totalAmount: 100,
        tenantId,
        SalesOrderItem: {
          create: {
            productId: productA,
            quantity: 3,
            price: 100,
            subtotal: 300,
          },
        },
      },
    });
  }

  it('decrements stock and records correct sale movement atomically', async () => {
    await prisma.inventoryStock.create({
      data: {
        warehouseId: warehouseA,
        inventoryItemId: itemA,
        quantity: 10,
        updatedAt: new Date(),
      },
    });
    await createPaidOrder(orderA, tenantA);

    await expect(repository.fulfillRetail(orderA, tenantA)).resolves.toBe(true);

    await expect(
      prisma.inventoryStock.findUnique({
        where: {
          warehouseId_inventoryItemId: {
            warehouseId: warehouseA,
            inventoryItemId: itemA,
          },
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ quantity: 7 }));
    await expect(
      prisma.inventoryMovement.findFirst({
        where: { referenceId: orderA, referenceType: 'ORDER' },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        tenantId: tenantA,
        quantity: 3,
        beforeQuantity: 10,
        afterQuantity: 7,
        type: 'SALE',
      }),
    );
  });

  it('does not process an order through another tenant context', async () => {
    await createPaidOrder(orderA, tenantA);

    await expect(repository.fulfillRetail(orderA, tenantB)).rejects.toThrow(
      'Order not found',
    );
    await expect(
      prisma.inventoryMovement.findMany({ where: { referenceId: orderA } }),
    ).resolves.toHaveLength(0);
  });

  it('is idempotent for an already completed order', async () => {
    await createPaidOrder(orderA, tenantA);
    await prisma.salesOrder.update({
      where: { id: orderA },
      data: { status: 'COMPLETED' },
    });

    await expect(repository.fulfillRetail(orderA, tenantA)).resolves.toBe(
      false,
    );
    await expect(
      prisma.inventoryMovement.findMany({ where: { referenceId: orderA } }),
    ).resolves.toHaveLength(0);
  });

  it('rolls back stock and movement when stock is insufficient', async () => {
    await prisma.inventoryStock.create({
      data: {
        warehouseId: warehouseA,
        inventoryItemId: itemA,
        quantity: 2,
        updatedAt: new Date(),
      },
    });
    await createPaidOrder(orderA, tenantA);

    await expect(repository.fulfillRetail(orderA, tenantA)).rejects.toThrow(
      'Insufficient stock',
    );
    await expect(
      prisma.inventoryStock.findUnique({
        where: {
          warehouseId_inventoryItemId: {
            warehouseId: warehouseA,
            inventoryItemId: itemA,
          },
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ quantity: 2 }));
    await expect(
      prisma.inventoryMovement.findMany({ where: { referenceId: orderA } }),
    ).resolves.toHaveLength(0);
  });

  it('serializes concurrent fulfillment attempts against the same stock row', async () => {
    await prisma.inventoryStock.create({
      data: {
        warehouseId: warehouseA,
        inventoryItemId: itemA,
        quantity: 3,
        updatedAt: new Date(),
      },
    });
    await createPaidOrder(orderA, tenantA);
    await createPaidOrder(orderB, tenantA);

    const results = await Promise.allSettled([
      repository.fulfillRetail(orderA, tenantA),
      repository.fulfillRetail(orderB, tenantA),
    ]);
    const successes = results.filter(
      (result) => result.status === 'fulfilled' && result.value === true,
    );

    expect(successes).toHaveLength(1);
    await expect(
      prisma.inventoryStock.findUnique({
        where: {
          warehouseId_inventoryItemId: {
            warehouseId: warehouseA,
            inventoryItemId: itemA,
          },
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ quantity: 0 }));
    await expect(
      prisma.inventoryMovement.count({
        where: {
          tenantId: tenantA,
          referenceType: 'ORDER',
          referenceId: { in: [orderA, orderB] },
        },
      }),
    ).resolves.toBe(1);
  });
});
