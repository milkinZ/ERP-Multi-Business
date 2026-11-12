import { OrderMode, OrderStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';
import { InventoryCostingService } from '../inventory/inventory-costing.service';
import { KitchenRepository } from './kitchen.repository';

describe('Kitchen PostgreSQL transaction guarantees', () => {
  const prisma = new PrismaService();
  const tenantId = `kitchen-it-tenant-${process.pid}`;
  const outletId = `kitchen-it-outlet-${process.pid}`;
  const userId = `kitchen-it-user-${process.pid}`;
  const productId = `kitchen-it-product-${process.pid}`;
  const orderId = `kitchen-it-order-${process.pid}`;
  let connected = false;

  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    await prisma.$connect();
    connected = true;
    await prisma.tenant.create({
      data: { id: tenantId, name: `Kitchen integration ${process.pid}` },
    });
    await prisma.outlet.create({
      data: { id: outletId, tenantId, name: 'Kitchen integration outlet' },
    });
  });

  afterAll(async () => {
    if (connected) {
      await prisma.$transaction(async (transaction) => {
        // Test fixtures must be removable despite the production append-only trigger.
        await transaction.$executeRaw`ALTER TABLE "AuditLog" DISABLE TRIGGER audit_log_append_only`;
        try {
          await transaction.auditLog.deleteMany({ where: { tenantId } });
        } finally {
          await transaction.$executeRaw`ALTER TABLE "AuditLog" ENABLE TRIGGER audit_log_append_only`;
        }
      });
      await prisma.salesOrderItem.deleteMany({ where: { orderId } });
      await prisma.salesOrder.deleteMany({ where: { id: orderId, tenantId } });
      await prisma.product.deleteMany({ where: { id: productId, tenantId } });
      await prisma.user.deleteMany({ where: { id: userId, tenantId } });
      await prisma.kitchenStationCategory.deleteMany({ where: { outletId } });
      await prisma.kitchenStation.deleteMany({ where: { outletId } });
      await prisma.outlet.deleteMany({ where: { id: outletId, tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
      await prisma.$disconnect();
    }
  });

  beforeEach(async () => {
    await prisma.kitchenStationCategory.deleteMany({ where: { outletId } });
    await prisma.kitchenStation.deleteMany({ where: { outletId } });
  });

  it('rolls back station and category writes together when a transaction fails', async () => {
    const stationId = `kitchen-it-rollback-${process.pid}`;
    await expect(
      prisma.$transaction(async (transaction) => {
        await transaction.kitchenStation.create({
          data: {
            id: stationId,
            tenantId,
            outletId,
            name: 'Rollback station',
          },
        });
        await transaction.kitchenStationCategory.create({
          data: { tenantId, outletId, stationId, category: 'rollback' },
        });
        throw new Error('force Kitchen rollback');
      }),
    ).rejects.toThrow('force Kitchen rollback');

    await expect(
      prisma.kitchenStation.count({
        where: { id: stationId, tenantId, outletId },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.kitchenStationCategory.count({
        where: { tenantId, outletId, category: 'rollback' },
      }),
    ).resolves.toBe(0);
  });

  it('allows only one concurrent station route per outlet category', async () => {
    const stationIds = [
      `kitchen-it-a-${process.pid}`,
      `kitchen-it-b-${process.pid}`,
    ];
    await prisma.kitchenStation.createMany({
      data: stationIds.map((id, index) => ({
        id,
        tenantId,
        outletId,
        name: `Concurrent station ${index}`,
      })),
    });

    const attempts = await Promise.allSettled(
      stationIds.map((stationId) =>
        prisma.kitchenStationCategory.create({
          data: { tenantId, outletId, stationId, category: 'coffee' },
        }),
      ),
    );

    expect(
      attempts.filter((attempt) => attempt.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      attempts.filter((attempt) => attempt.status === 'rejected'),
    ).toHaveLength(1);
    await expect(
      prisma.kitchenStationCategory.count({
        where: { tenantId, outletId, category: 'coffee' },
      }),
    ).resolves.toBe(1);
  });

  it('enqueues a paid order only once under concurrent requests', async () => {
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        tenantId,
      },
    });
    await prisma.product.create({
      data: {
        id: productId,
        name: 'Kitchen integration product',
        price: 250,
        tenantId,
        kitchenCategory: 'Coffee',
        kitchenPrepTimeMinutes: 5,
      },
    });
    await prisma.salesOrder.create({
      data: {
        id: orderId,
        orderNumber: `KIT-${process.pid}`,
        status: OrderStatus.PENDING,
        orderMode: OrderMode.REGULAR,
        paymentStatus: PaymentStatus.PAID,
        totalAmount: 250,
        tenantId,
        outletId,
        SalesOrderItem: {
          create: {
            id: `kitchen-it-item-${process.pid}`,
            productId,
            quantity: 1,
            price: 250,
            subtotal: 250,
          },
        },
      },
    });

    const repository = new KitchenRepository(
      prisma,
      new InventoryCostingService(),
    );
    const attempts = await Promise.allSettled([
      repository.enqueueTicket({ id: orderId, tenantId, outletId, userId }),
      repository.enqueueTicket({ id: orderId, tenantId, outletId, userId }),
    ]);

    expect(
      attempts.filter((attempt) => attempt.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      attempts.filter((attempt) => attempt.status === 'rejected'),
    ).toHaveLength(1);
    await expect(
      prisma.salesOrderItem.findUniqueOrThrow({
        where: { id: `kitchen-it-item-${process.pid}` },
      }),
    ).resolves.toMatchObject({
      kitchenCategorySnapshot: 'coffee',
      kitchenPrepTimeMinutes: 5,
    });
    await expect(
      prisma.auditLog.count({
        where: {
          tenantId,
          entityId: orderId,
          action: 'KITCHEN_TICKET_ENQUEUED',
        },
      }),
    ).resolves.toBe(1);
  });
});
