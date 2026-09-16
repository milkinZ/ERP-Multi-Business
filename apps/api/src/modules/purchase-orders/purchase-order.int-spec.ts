import {
  InventoryItemType,
  PrismaClient,
  PurchaseOrderStatus,
} from '@prisma/client';

import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';
import { DomainEventBus } from '../../core/events/domain-event-bus.service';
import { PurchaseOrderRepository } from './purchase-order.repository';
import { PurchaseOrderService } from './purchase-order.service';

const prisma = new PrismaClient();
const publish = jest.fn().mockResolvedValue(undefined);
const eventBus = { publish } as unknown as DomainEventBus;
const repository = new PurchaseOrderRepository(prisma as never);
const service = new PurchaseOrderService(prisma as never, eventBus, repository);

const tenantA = 'it-po-tenant-a';
const tenantB = 'it-po-tenant-b';
const supplierA = 'it-po-supplier-a';
const supplierB = 'it-po-supplier-b';
const warehouseA = 'it-po-warehouse-a';
const warehouseB = 'it-po-warehouse-b';
const itemA = 'it-po-item-a';
const itemB = 'it-po-item-b';
const poA = 'it-po-record-a';

async function cleanup() {
  await prisma.inventoryMovement.deleteMany({
    where: { referenceId: { in: [poA] } },
  });
  await prisma.inventoryStock.deleteMany({
    where: {
      warehouseId: { in: [warehouseA, warehouseB] },
      inventoryItemId: { in: [itemA, itemB] },
    },
  });
  await prisma.purchaseOrderItem.deleteMany({
    where: { purchaseOrderId: poA },
  });
  await prisma.purchaseOrder.deleteMany({
    where: { id: poA },
  });
  await prisma.inventoryItem.deleteMany({
    where: { id: { in: [itemA, itemB] } },
  });
  await prisma.warehouse.deleteMany({
    where: { id: { in: [warehouseA, warehouseB] } },
  });
  await prisma.supplier.deleteMany({
    where: { id: { in: [supplierA, supplierB] } },
  });
  await prisma.tenant.deleteMany({
    where: { id: { in: [tenantA, tenantB] } },
  });
}

describe('Purchase orders PostgreSQL integration', () => {
  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    await prisma.$connect();
    await cleanup();
    await prisma.tenant.createMany({
      data: [
        { id: tenantA, name: 'PO Tenant A', businessType: 'RETAIL' },
        { id: tenantB, name: 'PO Tenant B', businessType: 'RETAIL' },
      ],
    });
    await prisma.supplier.createMany({
      data: [
        { id: supplierA, name: 'Supplier A', tenantId: tenantA },
        { id: supplierB, name: 'Supplier B', tenantId: tenantB },
      ],
    });
    await prisma.warehouse.createMany({
      data: [
        {
          id: warehouseA,
          name: 'Warehouse A',
          code: 'IT-PO-A',
          tenantId: tenantA,
        },
        {
          id: warehouseB,
          name: 'Warehouse B',
          code: 'IT-PO-B',
          tenantId: tenantB,
        },
      ],
    });
    await prisma.inventoryItem.createMany({
      data: [
        {
          id: itemA,
          code: 'IT-PO-ITEM-A',
          name: 'PO Item A',
          type: InventoryItemType.MATERIAL,
          tenantId: tenantA,
        },
        {
          id: itemB,
          code: 'IT-PO-ITEM-B',
          name: 'PO Item B',
          type: InventoryItemType.MATERIAL,
          tenantId: tenantA,
        },
      ],
    });
  });

  beforeEach(async () => {
    publish.mockClear();
    await prisma.inventoryMovement.deleteMany({ where: { referenceId: poA } });
    await prisma.inventoryStock.deleteMany({
      where: { warehouseId: warehouseA, inventoryItemId: itemA },
    });
    await prisma.purchaseOrderItem.deleteMany({
      where: { purchaseOrderId: poA },
    });
    await prisma.purchaseOrder.deleteMany({ where: { id: poA } });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  async function createDraft() {
    const created = await service.create(tenantA, 'user-a', {
      supplierId: supplierA,
      warehouseId: warehouseA,
      items: [{ inventoryItemId: itemA, quantity: 4, unitPrice: 25 }],
    });
    return prisma.purchaseOrder.update({
      where: { id: created.id },
      data: { id: poA },
      include: { PurchaseOrderItem: true },
    });
  }

  it('creates tenant-scoped draft POs and hides them from another tenant', async () => {
    const created = await createDraft();

    await expect(service.findOne(tenantA, poA)).resolves.toEqual(
      expect.objectContaining({
        id: poA,
        tenantId: tenantA,
        status: PurchaseOrderStatus.DRAFT,
      }),
    );
    await expect(service.findOne(tenantB, poA)).rejects.toThrow(
      'Purchase Order not found',
    );
    expect(created.PurchaseOrderItem).toHaveLength(1);
    expect(created.PurchaseOrderItem[0].subtotal).toBe(100);
  });

  it('enforces lifecycle transitions and receives inventory atomically', async () => {
    await createDraft();

    await expect(
      service.updateStatus(tenantA, poA, PurchaseOrderStatus.RECEIVED),
    ).rejects.toThrow('Cannot transition from DRAFT to RECEIVED');
    await service.updateStatus(tenantA, poA, PurchaseOrderStatus.PENDING);
    await service.updateStatus(tenantA, poA, PurchaseOrderStatus.APPROVED);
    const received = await service.updateStatus(
      tenantA,
      poA,
      PurchaseOrderStatus.RECEIVED,
    );

    expect(received?.status).toBe(PurchaseOrderStatus.RECEIVED);
    await expect(
      prisma.inventoryStock.findUnique({
        where: {
          warehouseId_inventoryItemId: {
            warehouseId: warehouseA,
            inventoryItemId: itemA,
          },
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ quantity: 4 }));
    await expect(
      prisma.purchaseOrderItem.findMany({ where: { purchaseOrderId: poA } }),
    ).resolves.toEqual([
      expect.objectContaining({ quantity: 4, receivedQuantity: 4 }),
    ]);
    await expect(
      prisma.inventoryMovement.findMany({ where: { referenceId: poA } }),
    ).resolves.toEqual([
      expect.objectContaining({
        tenantId: tenantA,
        warehouseId: warehouseA,
        quantity: 4,
        beforeQuantity: 0,
        afterQuantity: 4,
        type: 'STOCK_IN',
        referenceType: 'PURCHASE_ORDER',
      }),
    ]);
  });

  it('is idempotent when the same receiving status is repeated', async () => {
    await createDraft();
    await service.updateStatus(tenantA, poA, PurchaseOrderStatus.PENDING);
    await service.updateStatus(tenantA, poA, PurchaseOrderStatus.APPROVED);
    await service.updateStatus(tenantA, poA, PurchaseOrderStatus.RECEIVED);
    await service.updateStatus(tenantA, poA, PurchaseOrderStatus.RECEIVED);

    await expect(
      prisma.inventoryStock.findUnique({
        where: {
          warehouseId_inventoryItemId: {
            warehouseId: warehouseA,
            inventoryItemId: itemA,
          },
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ quantity: 4 }));
    await expect(
      prisma.inventoryMovement.count({ where: { referenceId: poA } }),
    ).resolves.toBe(1);
  });

  it('does not delete a purchase order across tenant boundaries', async () => {
    await createDraft();

    await expect(service.delete(tenantB, poA)).rejects.toThrow(
      'Purchase Order not found',
    );
    await expect(
      prisma.purchaseOrder.findUnique({ where: { id: poA } }),
    ).resolves.toEqual(expect.objectContaining({ id: poA, tenantId: tenantA }));
  });

  it('allows only one concurrent receiving operation to create stock', async () => {
    await createDraft();
    await service.updateStatus(tenantA, poA, PurchaseOrderStatus.PENDING);
    await service.updateStatus(tenantA, poA, PurchaseOrderStatus.APPROVED);

    const results = await Promise.allSettled([
      service.updateStatus(tenantA, poA, PurchaseOrderStatus.RECEIVED),
      service.updateStatus(tenantA, poA, PurchaseOrderStatus.RECEIVED),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(2);
    await expect(
      prisma.inventoryStock.findUnique({
        where: {
          warehouseId_inventoryItemId: {
            warehouseId: warehouseA,
            inventoryItemId: itemA,
          },
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ quantity: 4 }));
    await expect(
      prisma.inventoryMovement.count({ where: { referenceId: poA } }),
    ).resolves.toBe(1);
  });

  it('rolls back receiving when PostgreSQL fails after an earlier item mutation', async () => {
    const created = await service.create(tenantA, 'user-a', {
      supplierId: supplierA,
      warehouseId: warehouseA,
      items: [
        { inventoryItemId: itemA, quantity: 4, unitPrice: 25 },
        { inventoryItemId: itemB, quantity: 2, unitPrice: 10 },
      ],
    });
    await prisma.purchaseOrder.update({
      where: { id: created.id },
      data: { id: poA },
    });
    await prisma.inventoryStock.create({
      data: {
        warehouseId: warehouseA,
        inventoryItemId: itemA,
        quantity: 10,
        updatedAt: new Date(),
      },
    });
    await service.updateStatus(tenantA, poA, PurchaseOrderStatus.PENDING);
    await service.updateStatus(tenantA, poA, PurchaseOrderStatus.APPROVED);

    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION it_po_force_failure()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW."referenceId" = '${poA}' AND NEW."inventoryItemId" = '${itemB}' THEN
          RAISE EXCEPTION 'forced receiving failure';
        END IF;
        RETURN NEW;
      END;
      $$;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER it_po_force_failure_trigger
      BEFORE INSERT ON "InventoryMovement"
      FOR EACH ROW EXECUTE FUNCTION it_po_force_failure();
    `);

    try {
      await expect(
        service.updateStatus(tenantA, poA, PurchaseOrderStatus.RECEIVED),
      ).rejects.toThrow('forced receiving failure');
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS it_po_force_failure_trigger ON "InventoryMovement"',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION IF EXISTS it_po_force_failure()',
      );
    }
    await expect(
      prisma.inventoryStock.findUnique({
        where: {
          warehouseId_inventoryItemId: {
            warehouseId: warehouseA,
            inventoryItemId: itemA,
          },
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ quantity: 10 }));
    await expect(
      prisma.inventoryMovement.count({ where: { referenceId: poA } }),
    ).resolves.toBe(0);
    await expect(
      prisma.purchaseOrder.findUnique({ where: { id: poA } }),
    ).resolves.toEqual(
      expect.objectContaining({ status: PurchaseOrderStatus.APPROVED }),
    );
  });
});
