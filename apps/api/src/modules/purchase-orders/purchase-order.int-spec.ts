import {
  InventoryItemType,
  PrismaClient,
  PurchaseOrderStatus,
} from '@prisma/client';

import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';
import { DomainEventBus } from '../../core/events/domain-event-bus.service';
import { InventoryCostingService } from '../inventory/inventory-costing.service';
import { PurchaseOrderRepository } from './purchase-order.repository';
import { PurchaseOrderService } from './purchase-order.service';

const prisma = new PrismaClient();
const publish = jest.fn().mockResolvedValue(undefined);
const eventBus = { publish } as unknown as DomainEventBus;
const repository = new PurchaseOrderRepository(prisma as never);
const service = new PurchaseOrderService(
  prisma as never,
  eventBus,
  repository,
  new InventoryCostingService(),
);

const tenantA = 'it-po-tenant-a';
const tenantB = 'it-po-tenant-b';
const userA = 'it-po-user-a';
const supplierA = 'it-po-supplier-a';
const supplierB = 'it-po-supplier-b';
const warehouseA = 'it-po-warehouse-a';
const warehouseB = 'it-po-warehouse-b';
const itemA = 'it-po-item-a';
const itemB = 'it-po-item-b';
const poA = 'it-po-record-a';

async function cleanup() {
  await prisma.inventoryCostLayer.deleteMany({
    where: { inventoryItemId: { in: [itemA, itemB] } },
  });
  const receipts = await prisma.purchaseOrderReceipt.findMany({
    where: { purchaseOrderId: poA },
    select: { id: true },
  });
  if (receipts.length > 0) {
    await prisma.inventoryMovement.deleteMany({
      where: {
        referenceType: 'PURCHASE_ORDER_RECEIPT',
        referenceId: { in: receipts.map((receipt) => receipt.id) },
      },
    });
  }
  await prisma.purchaseOrderReceipt.deleteMany({
    where: { purchaseOrderId: poA },
  });
  await prisma.outboxEvent.deleteMany({
    where: {
      tenantId: tenantA,
      type: {
        in: ['purchase-order.partially-received', 'purchase-order.received'],
      },
    },
  });
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
  await prisma.user.deleteMany({ where: { id: userA } });
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
        {
          id: tenantA,
          name: 'PO Tenant A',
          businessType: 'RETAIL',
          currencyCode: 'IDR',
        },
        {
          id: tenantB,
          name: 'PO Tenant B',
          businessType: 'RETAIL',
          currencyCode: 'IDR',
        },
      ],
    });
    await prisma.user.create({
      data: {
        id: userA,
        email: 'po-integration@example.invalid',
        password: 'integration-only',
        tenantId: tenantA,
      },
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
          valuationMethod: 'FIFO',
        },
        {
          id: itemB,
          code: 'IT-PO-ITEM-B',
          name: 'PO Item B',
          type: InventoryItemType.MATERIAL,
          tenantId: tenantA,
          valuationMethod: 'STANDARD_COST',
          standardCost: 1,
        },
      ],
    });
  });

  beforeEach(async () => {
    publish.mockClear();
    const receipts = await prisma.purchaseOrderReceipt.findMany({
      where: { purchaseOrderId: poA },
      select: { id: true },
    });
    if (receipts.length > 0) {
      await prisma.inventoryMovement.deleteMany({
        where: {
          referenceType: 'PURCHASE_ORDER_RECEIPT',
          referenceId: { in: receipts.map((receipt) => receipt.id) },
        },
      });
    }
    await prisma.purchaseOrderReceipt.deleteMany({
      where: { purchaseOrderId: poA },
    });
    await prisma.outboxEvent.deleteMany({
      where: {
        tenantId: tenantA,
        type: {
          in: ['purchase-order.partially-received', 'purchase-order.received'],
        },
      },
    });
    await prisma.inventoryMovement.deleteMany({ where: { referenceId: poA } });
    await prisma.inventoryCostLayer.deleteMany({
      where: { inventoryItemId: { in: [itemA, itemB] } },
    });
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
    expect(created.currencyCode).toBe('IDR');
    expect(created.PurchaseOrderItem).toHaveLength(1);
    expect(created.PurchaseOrderItem[0].subtotal).toBe(100);
  });

  it('requires a tenant base currency before creating a purchase order', async () => {
    await prisma.tenant.update({
      where: { id: tenantB },
      data: { currencyCode: null },
    });

    await expect(
      repository.createPurchaseOrder({
        tenantId: tenantB,
        poNumber: 'IT-PO-NO-CURRENCY',
        supplierId: supplierB,
        warehouseId: warehouseB,
        items: [{ inventoryItemId: itemB, quantity: 1, unitPrice: 1 }],
      }),
    ).rejects.toThrow(
      'Configure the tenant base currency before creating financial transactions',
    );

    await prisma.tenant.update({
      where: { id: tenantB },
      data: { currencyCode: 'IDR' },
    });
  });

  it('searches, filters inclusive dates, and sorts the bounded PO catalog', async () => {
    await createDraft();
    await prisma.purchaseOrder.update({
      where: { id: poA },
      data: {
        poNumber: 'PO-CATALOG-100',
        createdAt: new Date('2026-03-15T12:00:00.000Z'),
      },
    });

    const result = await service.findAll(tenantA, {
      search: 'catalog-100',
      fromDate: '2026-03-15',
      toDate: '2026-03-15',
      sortBy: 'poNumber',
      sortOrder: 'asc',
      skip: 0,
      take: 10,
    });

    expect(result.data.map((order) => order.id)).toEqual([poA]);
    expect(result.pagination.total).toBe(1);
  });

  it('enforces lifecycle transitions and receives inventory atomically', async () => {
    const draft = await createDraft();

    await expect(
      service.updateStatus(tenantA, poA, PurchaseOrderStatus.RECEIVED),
    ).rejects.toThrow('Cannot transition from DRAFT to RECEIVED');
    await service.updateStatus(tenantA, poA, PurchaseOrderStatus.PENDING);
    await service.updateStatus(tenantA, poA, PurchaseOrderStatus.APPROVED);
    await expect(
      service.updateStatus(tenantA, poA, PurchaseOrderStatus.RECEIVED),
    ).rejects.toThrow('Use the purchase order receipt endpoint');
    const receipt = await service.receivePurchaseOrder(
      tenantA,
      poA,
      userA,
      'po-receipt-complete',
      {
        items: [
          {
            purchaseOrderItemId: draft.PurchaseOrderItem[0].id,
            receivedQuantity: 4,
          },
        ],
      },
    );

    expect(receipt.statusAfter).toBe(PurchaseOrderStatus.RECEIVED);
    const receiptLayer = await prisma.inventoryCostLayer.findFirst({
      where: {
        inventoryItemId: itemA,
        sourceReferenceId: receipt.id,
      },
    });
    expect(receiptLayer?.unitCost.toString()).toBe('25');
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
      prisma.inventoryMovement.findMany({
        where: {
          referenceType: 'PURCHASE_ORDER_RECEIPT',
          referenceId: receipt.id,
        },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        tenantId: tenantA,
        warehouseId: warehouseA,
        quantity: 4,
        beforeQuantity: 0,
        afterQuantity: 4,
        type: 'STOCK_IN',
        referenceType: 'PURCHASE_ORDER_RECEIPT',
      }),
    ]);
  });

  it('replays the same idempotent receipt without changing inventory twice', async () => {
    const draft = await createDraft();
    await service.updateStatus(tenantA, poA, PurchaseOrderStatus.PENDING);
    await service.updateStatus(tenantA, poA, PurchaseOrderStatus.APPROVED);
    const request = {
      items: [
        {
          purchaseOrderItemId: draft.PurchaseOrderItem[0].id,
          receivedQuantity: 4,
        },
      ],
    };
    const firstReceipt = await service.receivePurchaseOrder(
      tenantA,
      poA,
      userA,
      'po-idempotent-receipt',
      request,
    );
    const repeatedReceipt = await service.receivePurchaseOrder(
      tenantA,
      poA,
      userA,
      'po-idempotent-receipt',
      request,
    );
    expect(repeatedReceipt.id).toBe(firstReceipt.id);

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
      prisma.inventoryMovement.count({
        where: {
          referenceType: 'PURCHASE_ORDER_RECEIPT',
          referenceId: firstReceipt.id,
        },
      }),
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

  it('records standard-cost purchase price variance per receipt and tenant-scopes the report', async () => {
    const created = await service.create(tenantA, userA, {
      supplierId: supplierA,
      warehouseId: warehouseA,
      items: [{ inventoryItemId: itemB, quantity: 2, unitPrice: 10 }],
    });
    const po = await prisma.purchaseOrder.update({
      where: { id: created.id },
      data: { id: poA },
      include: { PurchaseOrderItem: true },
    });
    await service.updateStatus(tenantA, poA, PurchaseOrderStatus.PENDING);
    await service.updateStatus(tenantA, poA, PurchaseOrderStatus.APPROVED);
    const orderItemId = po.PurchaseOrderItem[0].id;

    const firstReceipt = await service.receivePurchaseOrder(
      tenantA,
      poA,
      userA,
      'standard-cost-variance-first',
      { items: [{ purchaseOrderItemId: orderItemId, receivedQuantity: 1 }] },
    );
    await service.receivePurchaseOrder(
      tenantA,
      poA,
      userA,
      'standard-cost-variance-second',
      { items: [{ purchaseOrderItemId: orderItemId, receivedQuantity: 1 }] },
    );
    await service.receivePurchaseOrder(
      tenantA,
      poA,
      userA,
      'standard-cost-variance-second',
      { items: [{ purchaseOrderItemId: orderItemId, receivedQuantity: 1 }] },
    );

    const varianceEntries =
      await prisma.inventoryPurchasePriceVariance.findMany({
        where: { tenantId: tenantA },
        orderBy: { createdAt: 'asc' },
      });
    expect(varianceEntries).toHaveLength(2);
    expect(varianceEntries[0].receiptId).toBe(firstReceipt.id);
    expect(varianceEntries[0].receiptItemId).toBe(firstReceipt.Items[0].id);
    expect(varianceEntries[0].quantity.toString()).toBe('1');
    expect(varianceEntries[0].standardUnitCost.toString()).toBe('1');
    expect(varianceEntries[0].actualUnitCost.toString()).toBe('10');
    expect(varianceEntries[0].varianceAmount.toString()).toBe('9');
    expect(varianceEntries[0].currencyCode).toBe('IDR');

    const report = await service.findPriceVariances(tenantA, {
      skip: 0,
      take: 20,
    });
    expect(report.data).toHaveLength(2);
    expect(report.accountingStatus).toBe('NOT_POSTED');
    expect(report.totals).toHaveLength(1);
    expect(report.totals[0].currencyCode).toBe('IDR');
    expect(report.totals[0].varianceAmount.toString()).toBe('18');
    expect(report.totals[0].count).toBe(2);
    expect(report.data[0].accountingStatus).toBe('NOT_POSTED');
    const otherTenantReport = await service.findPriceVariances(tenantB, {
      skip: 0,
      take: 20,
    });
    expect(otherTenantReport.data).toHaveLength(0);
    expect(otherTenantReport.pagination.total).toBe(0);
    expect(otherTenantReport.totals).toHaveLength(0);
  });

  it('replays a concurrent duplicate receipt without applying stock twice', async () => {
    const draft = await createDraft();
    await service.updateStatus(tenantA, poA, PurchaseOrderStatus.PENDING);
    await service.updateStatus(tenantA, poA, PurchaseOrderStatus.APPROVED);

    const request = {
      items: [
        {
          purchaseOrderItemId: draft.PurchaseOrderItem[0].id,
          receivedQuantity: 4,
        },
      ],
    };
    const receipts = await Promise.all([
      service.receivePurchaseOrder(
        tenantA,
        poA,
        userA,
        'po-concurrent-idempotency',
        request,
      ),
      service.receivePurchaseOrder(
        tenantA,
        poA,
        userA,
        'po-concurrent-idempotency',
        request,
      ),
    ]);

    expect(receipts[0].id).toBe(receipts[1].id);
    await expect(
      prisma.purchaseOrderReceipt.count({ where: { purchaseOrderId: poA } }),
    ).resolves.toBe(1);
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
    ).resolves.toBe(0);
    await expect(
      prisma.inventoryMovement.count({
        where: {
          referenceType: 'PURCHASE_ORDER_RECEIPT',
          referenceId: receipts[0].id,
        },
      }),
    ).resolves.toBe(1);
  });

  it('records incremental receipts and advances status only when all items arrive', async () => {
    const draft = await createDraft();
    await service.updateStatus(tenantA, poA, PurchaseOrderStatus.PENDING);
    await service.updateStatus(tenantA, poA, PurchaseOrderStatus.APPROVED);
    const itemId = draft.PurchaseOrderItem[0].id;

    const partialReceipt = await service.receivePurchaseOrder(
      tenantA,
      poA,
      userA,
      'po-partial-delivery-1',
      { items: [{ purchaseOrderItemId: itemId, receivedQuantity: 1.5 }] },
    );
    expect(partialReceipt.statusAfter).toBe(
      PurchaseOrderStatus.PARTIALLY_RECEIVED,
    );
    await expect(
      prisma.purchaseOrder.findUnique({ where: { id: poA } }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: PurchaseOrderStatus.PARTIALLY_RECEIVED,
      }),
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
    ).resolves.toEqual(expect.objectContaining({ quantity: 1.5 }));

    const finalReceipt = await service.receivePurchaseOrder(
      tenantA,
      poA,
      userA,
      'po-partial-delivery-2',
      { items: [{ purchaseOrderItemId: itemId, receivedQuantity: 2.5 }] },
    );
    expect(finalReceipt.statusAfter).toBe(PurchaseOrderStatus.RECEIVED);
    await expect(
      prisma.purchaseOrder.findUnique({ where: { id: poA } }),
    ).resolves.toEqual(
      expect.objectContaining({ status: PurchaseOrderStatus.RECEIVED }),
    );
    await expect(
      prisma.purchaseOrderItem.findUnique({ where: { id: itemId } }),
    ).resolves.toEqual(expect.objectContaining({ receivedQuantity: 4 }));
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
      prisma.inventoryMovement.count({
        where: { referenceType: 'PURCHASE_ORDER_RECEIPT' },
      }),
    ).resolves.toBe(2);
    await expect(
      prisma.outboxEvent.count({
        where: {
          tenantId: tenantA,
          type: {
            in: [
              'purchase-order.partially-received',
              'purchase-order.received',
            ],
          },
        },
      }),
    ).resolves.toBe(2);
  });

  it('rejects over-receipt and idempotency-key reuse with a different payload', async () => {
    const draft = await createDraft();
    await service.updateStatus(tenantA, poA, PurchaseOrderStatus.PENDING);
    await service.updateStatus(tenantA, poA, PurchaseOrderStatus.APPROVED);
    const itemId = draft.PurchaseOrderItem[0].id;
    const firstRequest = {
      items: [{ purchaseOrderItemId: itemId, receivedQuantity: 2 }],
    };
    await service.receivePurchaseOrder(
      tenantA,
      poA,
      userA,
      'po-receipt-key-conflict',
      firstRequest,
    );

    await expect(
      service.receivePurchaseOrder(
        tenantA,
        poA,
        userA,
        'po-receipt-key-conflict',
        { items: [{ purchaseOrderItemId: itemId, receivedQuantity: 1 }] },
      ),
    ).rejects.toThrow('Idempotency-Key was already used');
    await expect(
      service.receivePurchaseOrder(tenantA, poA, userA, 'po-over-receipt', {
        items: [{ purchaseOrderItemId: itemId, receivedQuantity: 3 }],
      }),
    ).rejects.toThrow('Cannot receive more than the ordered quantity');

    await expect(
      prisma.purchaseOrderItem.findUnique({ where: { id: itemId } }),
    ).resolves.toEqual(expect.objectContaining({ receivedQuantity: 2 }));
    await expect(
      prisma.purchaseOrderReceipt.count({ where: { purchaseOrderId: poA } }),
    ).resolves.toBe(1);
  });

  it('rolls back receipt, inventory, status, and outbox when PostgreSQL fails', async () => {
    const created = await service.create(tenantA, 'user-a', {
      supplierId: supplierA,
      warehouseId: warehouseA,
      items: [
        { inventoryItemId: itemA, quantity: 4, unitPrice: 25 },
        { inventoryItemId: itemB, quantity: 2, unitPrice: 10 },
      ],
    });
    const po = await prisma.purchaseOrder.update({
      where: { id: created.id },
      data: { id: poA },
      include: { PurchaseOrderItem: true },
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
        IF NEW."tenantId" = '${tenantA}'
          AND NEW."referenceType" = 'PURCHASE_ORDER_RECEIPT'
          AND NEW."inventoryItemId" = '${itemB}' THEN
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
        service.receivePurchaseOrder(tenantA, poA, userA, 'po-forced-failure', {
          items: po.PurchaseOrderItem.map((item) => ({
            purchaseOrderItemId: item.id,
            receivedQuantity: item.quantity,
          })),
        }),
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
      prisma.inventoryMovement.count({
        where: {
          referenceType: 'PURCHASE_ORDER_RECEIPT',
          tenantId: tenantA,
        },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.purchaseOrder.findUnique({ where: { id: poA } }),
    ).resolves.toEqual(
      expect.objectContaining({ status: PurchaseOrderStatus.APPROVED }),
    );
    await expect(
      prisma.purchaseOrderReceipt.count({ where: { purchaseOrderId: poA } }),
    ).resolves.toBe(0);
    await expect(
      prisma.outboxEvent.count({
        where: {
          tenantId: tenantA,
          type: 'purchase-order.received',
        },
      }),
    ).resolves.toBe(0);
  });
});
