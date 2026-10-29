import {
  InventoryMovementType,
  PrismaClient,
  WarehouseTransferStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';

import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';
import { WarehouseTransferService } from './warehouse-transfer.service';

const prisma = new PrismaClient();
const service = new WarehouseTransferService(prisma as never);

const tenantA = 'it-transfer-tenant-a';
const tenantB = 'it-transfer-tenant-b';
const userA = 'it-transfer-user-a';
const userB = 'it-transfer-user-b';
const outletA = 'it-transfer-outlet-a';
const outletC = 'it-transfer-outlet-c';
const warehouseA = 'it-transfer-warehouse-a';
const warehouseC = 'it-transfer-warehouse-c';
const warehouseB = 'it-transfer-warehouse-b';
const itemA = 'it-transfer-item-a';
const itemB = 'it-transfer-item-b';

async function cleanup() {
  await prisma.inventoryMovement.deleteMany({
    where: {
      tenantId: tenantA,
      referenceType: {
        in: ['WAREHOUSE_TRANSFER_SHIPMENT', 'WAREHOUSE_TRANSFER_RECEIPT'],
      },
    },
  });
  await prisma.warehouseTransferReceipt.deleteMany({
    where: { tenantId: tenantA },
  });
  await prisma.warehouseTransfer.deleteMany({
    where: { tenantId: tenantA },
  });
  await prisma.outboxEvent.deleteMany({
    where: { tenantId: tenantA, type: { startsWith: 'warehouse-transfer.' } },
  });
  await prisma.inventoryStock.deleteMany({
    where: { warehouseId: { in: [warehouseA, warehouseB, warehouseC] } },
  });
  await prisma.inventoryItem.deleteMany({
    where: { id: { in: [itemA, itemB] } },
  });
  await prisma.warehouse.deleteMany({
    where: { id: { in: [warehouseA, warehouseB, warehouseC] } },
  });
  await prisma.outlet.deleteMany({
    where: { id: { in: [outletA, outletC] } },
  });
  await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
}

describe('Warehouse transfers PostgreSQL integration', () => {
  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    await prisma.$connect();
    await cleanup();
    await prisma.tenant.createMany({
      data: [
        { id: tenantA, name: 'Transfer Tenant A', businessType: 'RETAIL' },
        { id: tenantB, name: 'Transfer Tenant B', businessType: 'RETAIL' },
      ],
    });
    await prisma.user.createMany({
      data: [
        {
          id: userA,
          email: 'transfer-a@example.invalid',
          password: 'integration-only',
          tenantId: tenantA,
        },
        {
          id: userB,
          email: 'transfer-b@example.invalid',
          password: 'integration-only',
          tenantId: tenantB,
        },
      ],
    });
    await prisma.outlet.createMany({
      data: [
        { id: outletA, name: 'Source outlet', tenantId: tenantA },
        { id: outletC, name: 'Destination outlet', tenantId: tenantA },
      ],
    });
    await prisma.warehouse.createMany({
      data: [
        {
          id: warehouseA,
          name: 'Transfer source A',
          code: 'TR-A',
          tenantId: tenantA,
          outletId: outletA,
        },
        {
          id: warehouseC,
          name: 'Transfer destination A',
          code: 'TR-C',
          tenantId: tenantA,
          outletId: outletC,
        },
        {
          id: warehouseB,
          name: 'Transfer warehouse B',
          code: 'TR-B',
          tenantId: tenantB,
        },
      ],
    });
    await prisma.inventoryItem.createMany({
      data: [
        {
          id: itemA,
          code: 'TR-ITEM-A',
          name: 'Transfer item A',
          type: 'MATERIAL',
          tenantId: tenantA,
          valuationMethod: 'STANDARD_COST',
          standardCost: 1,
        },
        {
          id: itemB,
          code: 'TR-ITEM-B',
          name: 'Transfer item B',
          type: 'MATERIAL',
          tenantId: tenantA,
          valuationMethod: 'STANDARD_COST',
          standardCost: 1,
        },
      ],
    });
  });

  beforeEach(async () => {
    await cleanupTransferData();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  async function cleanupTransferData() {
    await prisma.inventoryMovement.deleteMany({
      where: {
        tenantId: tenantA,
        referenceType: {
          in: ['WAREHOUSE_TRANSFER_SHIPMENT', 'WAREHOUSE_TRANSFER_RECEIPT'],
        },
      },
    });
    await prisma.warehouseTransferReceipt.deleteMany({
      where: { tenantId: tenantA },
    });
    await prisma.warehouseTransfer.deleteMany({
      where: { tenantId: tenantA },
    });
    await prisma.outboxEvent.deleteMany({
      where: {
        tenantId: tenantA,
        type: { startsWith: 'warehouse-transfer.' },
      },
    });
    await prisma.inventoryStock.deleteMany({
      where: { warehouseId: { in: [warehouseA, warehouseC] } },
    });
  }

  async function createTransfer(
    items = [{ inventoryItemId: itemA, quantity: 4 }],
    key = `transfer-${randomUUID()}`,
  ) {
    return service.create(tenantA, userA, key, {
      sourceWarehouseId: warehouseA,
      destinationWarehouseId: warehouseC,
      items,
    });
  }

  async function shipTransfer(
    items = [{ inventoryItemId: itemA, quantity: 4 }],
  ) {
    const transfer = await createTransfer(items);
    return {
      transfer,
      shipped: await service.ship(tenantA, transfer.id, userA),
    };
  }

  async function setStock(
    warehouseId: string,
    inventoryItemId: string,
    quantity: number,
  ) {
    return prisma.inventoryStock.create({
      data: {
        warehouseId,
        inventoryItemId,
        quantity,
        updatedAt: new Date(),
      },
    });
  }

  it('creates idempotent tenant-scoped transfers and rejects cross-tenant warehouses', async () => {
    const input = {
      sourceWarehouseId: warehouseA,
      destinationWarehouseId: warehouseC,
      items: [{ inventoryItemId: itemA, quantity: 2 }],
    };
    const [first, replay] = await Promise.all([
      service.create(tenantA, userA, 'transfer-create-idempotent', input),
      service.create(tenantA, userA, 'transfer-create-idempotent', input),
    ]);
    expect(replay.id).toBe(first.id);
    expect(first.SourceWarehouse.outletId).toBe(outletA);
    expect(first.DestinationWarehouse.outletId).toBe(outletC);
    await expect(service.findOne(tenantB, first.id)).rejects.toThrow(
      'Warehouse transfer not found',
    );

    await expect(
      service.create(tenantA, userA, 'cross-tenant-warehouse', {
        ...input,
        destinationWarehouseId: warehouseB,
      }),
    ).rejects.toThrow('Source or destination warehouse not found');
  });

  it('rejects same-warehouse transfers and idempotency-key payload conflicts', async () => {
    await expect(
      service.create(tenantA, userA, 'same-warehouse', {
        sourceWarehouseId: warehouseA,
        destinationWarehouseId: warehouseA,
        items: [{ inventoryItemId: itemA, quantity: 1 }],
      }),
    ).rejects.toThrow('warehouses must be different');

    const transfer = await createTransfer();
    await expect(
      service.create(tenantA, userA, 'transfer-create-conflict', {
        sourceWarehouseId: warehouseA,
        destinationWarehouseId: warehouseC,
        items: [{ inventoryItemId: itemA, quantity: 2 }],
      }),
    ).resolves.toBeDefined();
    await expect(
      service.create(tenantA, userA, 'transfer-create-conflict', {
        sourceWarehouseId: warehouseA,
        destinationWarehouseId: warehouseC,
        items: [{ inventoryItemId: itemA, quantity: 3 }],
      }),
    ).rejects.toThrow('Idempotency-Key was already used');
    expect(transfer.status).toBe(WarehouseTransferStatus.PENDING);
  });

  it('does not ship when source stock is insufficient', async () => {
    const transfer = await createTransfer();
    await setStock(warehouseA, itemA, 3);

    await expect(service.ship(tenantA, transfer.id, userA)).rejects.toThrow(
      'Insufficient source stock',
    );
    await expect(
      prisma.warehouseTransfer.findUnique({ where: { id: transfer.id } }),
    ).resolves.toEqual(
      expect.objectContaining({ status: WarehouseTransferStatus.PENDING }),
    );
    await expect(
      prisma.inventoryMovement.count({
        where: { referenceType: 'WAREHOUSE_TRANSFER_SHIPMENT' },
      }),
    ).resolves.toBe(0);
  });

  it('ships stock once and records the source movement atomically', async () => {
    const transfer = await createTransfer();
    await setStock(warehouseA, itemA, 10);

    const shipped = await service.ship(tenantA, transfer.id, userA);
    const repeatedShip = await service.ship(tenantA, transfer.id, userA);
    expect(shipped.status).toBe(WarehouseTransferStatus.IN_TRANSIT);
    expect(repeatedShip.status).toBe(WarehouseTransferStatus.IN_TRANSIT);
    await expect(
      prisma.inventoryStock.findUnique({
        where: {
          warehouseId_inventoryItemId: {
            warehouseId: warehouseA,
            inventoryItemId: itemA,
          },
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ quantity: 6 }));
    await expect(
      prisma.inventoryMovement.findMany({
        where: {
          referenceType: 'WAREHOUSE_TRANSFER_SHIPMENT',
          referenceId: transfer.id,
        },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        tenantId: tenantA,
        type: InventoryMovementType.TRANSFER,
        quantity: 4,
        beforeQuantity: 10,
        afterQuantity: 6,
      }),
    ]);
  });

  it('supports partial receipts and closes only when all shipped quantities arrive', async () => {
    await setStock(warehouseA, itemA, 10);
    const { transfer, shipped } = await shipTransfer();
    const transferItemId = shipped.Items[0].id;

    const partial = await service.receive(
      tenantA,
      transfer.id,
      userA,
      'transfer-receipt-part-1',
      { items: [{ transferItemId, receivedQuantity: 1.5 }] },
    );
    expect(partial.Items[0].receivedQuantity).toBe(1.5);
    await expect(
      prisma.warehouseTransfer.findUnique({ where: { id: transfer.id } }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: WarehouseTransferStatus.PARTIALLY_RECEIVED,
      }),
    );
    await expect(
      prisma.inventoryStock.findUnique({
        where: {
          warehouseId_inventoryItemId: {
            warehouseId: warehouseC,
            inventoryItemId: itemA,
          },
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ quantity: 1.5 }));

    await service.receive(
      tenantA,
      transfer.id,
      userA,
      'transfer-receipt-part-2',
      { items: [{ transferItemId, receivedQuantity: 2.5 }] },
    );
    await expect(
      prisma.warehouseTransfer.findUnique({ where: { id: transfer.id } }),
    ).resolves.toEqual(
      expect.objectContaining({ status: WarehouseTransferStatus.RECEIVED }),
    );
    await expect(
      prisma.warehouseTransferItem.findUnique({
        where: { id: transferItemId },
      }),
    ).resolves.toEqual(expect.objectContaining({ receivedQuantity: 4 }));
    await expect(
      prisma.inventoryStock.findUnique({
        where: {
          warehouseId_inventoryItemId: {
            warehouseId: warehouseC,
            inventoryItemId: itemA,
          },
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ quantity: 4 }));
    await expect(
      prisma.outboxEvent.count({
        where: {
          tenantId: tenantA,
          type: {
            in: [
              'warehouse-transfer.shipped',
              'warehouse-transfer.partially-received',
              'warehouse-transfer.received',
            ],
          },
        },
      }),
    ).resolves.toBe(3);
  });

  it('replays concurrent same-key receipts without double-crediting destination stock', async () => {
    await setStock(warehouseA, itemA, 10);
    const { transfer, shipped } = await shipTransfer();
    const request = {
      items: [{ transferItemId: shipped.Items[0].id, receivedQuantity: 2 }],
    };

    const receipts = await Promise.all([
      service.receive(
        tenantA,
        transfer.id,
        userA,
        'transfer-concurrent-receipt',
        request,
      ),
      service.receive(
        tenantA,
        transfer.id,
        userA,
        'transfer-concurrent-receipt',
        request,
      ),
    ]);
    expect(receipts[0].id).toBe(receipts[1].id);
    await expect(
      prisma.warehouseTransferReceipt.count({
        where: { transferId: transfer.id },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.inventoryStock.findUnique({
        where: {
          warehouseId_inventoryItemId: {
            warehouseId: warehouseC,
            inventoryItemId: itemA,
          },
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ quantity: 2 }));
  });

  it('allows a positive final receipt smaller than the initial transfer minimum', async () => {
    await setStock(warehouseA, itemA, 10);
    const { transfer, shipped } = await shipTransfer([
      { inventoryItemId: itemA, quantity: 1 },
    ]);
    const transferItemId = shipped.Items[0].id;

    await service.receive(
      tenantA,
      transfer.id,
      userA,
      'transfer-small-first-receipt',
      { items: [{ transferItemId, receivedQuantity: 0.95 }] },
    );
    await service.receive(
      tenantA,
      transfer.id,
      userA,
      'transfer-small-final-receipt',
      { items: [{ transferItemId, receivedQuantity: 0.05 }] },
    );

    await expect(
      prisma.warehouseTransfer.findUnique({ where: { id: transfer.id } }),
    ).resolves.toEqual(
      expect.objectContaining({ status: WarehouseTransferStatus.RECEIVED }),
    );
    await expect(
      prisma.inventoryStock.findUnique({
        where: {
          warehouseId_inventoryItemId: {
            warehouseId: warehouseC,
            inventoryItemId: itemA,
          },
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ quantity: 1 }));
  });

  it('rejects over-receipt and reusing a receipt key with a different request', async () => {
    await setStock(warehouseA, itemA, 10);
    const { transfer, shipped } = await shipTransfer();
    const transferItemId = shipped.Items[0].id;
    const firstRequest = {
      items: [{ transferItemId, receivedQuantity: 1 }],
    };
    await service.receive(
      tenantA,
      transfer.id,
      userA,
      'transfer-receipt-key-conflict',
      firstRequest,
    );

    await expect(
      service.receive(
        tenantA,
        transfer.id,
        userA,
        'transfer-receipt-key-conflict',
        {
          items: [{ transferItemId, receivedQuantity: 2 }],
        },
      ),
    ).rejects.toThrow('Idempotency-Key was already used');
    await expect(
      service.receive(tenantA, transfer.id, userA, 'transfer-over-receipt', {
        items: [{ transferItemId, receivedQuantity: 4 }],
      }),
    ).rejects.toThrow('Cannot receive more than the quantity shipped');
    await expect(
      prisma.warehouseTransferItem.findUnique({
        where: { id: transferItemId },
      }),
    ).resolves.toEqual(expect.objectContaining({ receivedQuantity: 1 }));
    await expect(
      prisma.inventoryStock.findUnique({
        where: {
          warehouseId_inventoryItemId: {
            warehouseId: warehouseC,
            inventoryItemId: itemA,
          },
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ quantity: 1 }));
  });

  it('cancels pending transfers but does not cancel shipped stock in transit', async () => {
    const pending = await createTransfer();
    await expect(service.cancel(tenantA, pending.id)).resolves.toEqual(
      expect.objectContaining({ status: WarehouseTransferStatus.CANCELLED }),
    );
    await setStock(warehouseA, itemA, 10);
    const { transfer } = await shipTransfer();
    await expect(service.cancel(tenantA, transfer.id)).rejects.toThrow(
      'Only pending transfers can be cancelled',
    );
  });

  it('rolls back all receipt changes when inventory movement persistence fails', async () => {
    await setStock(warehouseA, itemA, 10);
    await setStock(warehouseA, itemB, 10);
    await setStock(warehouseC, itemA, 5);
    const { transfer, shipped } = await shipTransfer([
      { inventoryItemId: itemA, quantity: 2 },
      { inventoryItemId: itemB, quantity: 2 },
    ]);

    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION it_transfer_force_failure()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW."tenantId" = '${tenantA}'
          AND NEW."referenceType" = 'WAREHOUSE_TRANSFER_RECEIPT'
          AND NEW."inventoryItemId" = '${itemB}' THEN
          RAISE EXCEPTION 'forced transfer receipt failure';
        END IF;
        RETURN NEW;
      END;
      $$;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER it_transfer_force_failure_trigger
      BEFORE INSERT ON "InventoryMovement"
      FOR EACH ROW EXECUTE FUNCTION it_transfer_force_failure();
    `);

    try {
      await expect(
        service.receive(
          tenantA,
          transfer.id,
          userA,
          'transfer-forced-receipt-failure',
          {
            items: shipped.Items.map((item) => ({
              transferItemId: item.id,
              receivedQuantity: item.quantity,
            })),
          },
        ),
      ).rejects.toThrow('forced transfer receipt failure');
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS it_transfer_force_failure_trigger ON "InventoryMovement"',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION IF EXISTS it_transfer_force_failure()',
      );
    }

    await expect(
      prisma.inventoryStock.findUnique({
        where: {
          warehouseId_inventoryItemId: {
            warehouseId: warehouseC,
            inventoryItemId: itemA,
          },
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ quantity: 5 }));
    await expect(
      prisma.warehouseTransferItem.findMany({
        where: { transferId: transfer.id },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ receivedQuantity: 0 }),
        expect.objectContaining({ receivedQuantity: 0 }),
      ]),
    );
    await expect(
      prisma.warehouseTransferReceipt.count({
        where: { transferId: transfer.id },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.warehouseTransfer.findUnique({ where: { id: transfer.id } }),
    ).resolves.toEqual(
      expect.objectContaining({ status: WarehouseTransferStatus.IN_TRANSIT }),
    );
  });
});
