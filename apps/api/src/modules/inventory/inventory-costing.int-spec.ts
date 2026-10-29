import { PrismaClient } from '@prisma/client';

import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';
import { InventoryRepository } from './inventory.repository';
import { WarehouseTransferService } from './warehouse-transfer.service';

const prisma = new PrismaClient();
const repository = new InventoryRepository(prisma as never);
const transfers = new WarehouseTransferService(prisma as never);
const tenantId = 'it-costing-tenant';
const userId = 'it-costing-user';
const supplierId = 'it-costing-supplier';
const warehouseA = 'it-costing-warehouse-a';
const warehouseB = 'it-costing-warehouse-b';
const fifoItemId = 'it-costing-fifo-item';
const averageItemId = 'it-costing-average-item';
const historicalPurchaseOrderId = 'it-costing-historical-po';
const historicalPurchaseOrderItemId = 'it-costing-historical-po-item';
const historicalReceiptId = 'it-costing-historical-receipt';
const completedLegacyOrderId = 'it-costing-completed-legacy-order';

async function cleanup() {
  await prisma.purchaseOrderReceiptItem.deleteMany({
    where: { receiptId: historicalReceiptId },
  });
  await prisma.purchaseOrderReceipt.deleteMany({
    where: { id: historicalReceiptId },
  });
  await prisma.purchaseOrderItem.deleteMany({
    where: { id: historicalPurchaseOrderItemId },
  });
  await prisma.purchaseOrder.deleteMany({
    where: { id: historicalPurchaseOrderId },
  });
  await prisma.warehouseTransferReceipt.deleteMany({ where: { tenantId } });
  await prisma.warehouseTransfer.deleteMany({ where: { tenantId } });
  await prisma.outboxEvent.deleteMany({
    where: { tenantId, type: { startsWith: 'warehouse-transfer.' } },
  });
  await prisma.inventoryMovement.deleteMany({
    where: { tenantId },
  });
  await prisma.salesOrder.deleteMany({
    where: { id: completedLegacyOrderId },
  });
  await prisma.inventoryCostLayer.deleteMany({
    where: { inventoryItemId: { in: [fifoItemId, averageItemId] } },
  });
  await prisma.inventoryStock.deleteMany({
    where: { inventoryItemId: { in: [fifoItemId, averageItemId] } },
  });
  await prisma.inventoryItem.deleteMany({
    where: { id: { in: [fifoItemId, averageItemId] } },
  });
  await prisma.warehouse.deleteMany({
    where: { id: { in: [warehouseA, warehouseB] } },
  });
  await prisma.supplier.deleteMany({ where: { id: supplierId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

describe('Inventory costing PostgreSQL integration', () => {
  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    await prisma.$connect();
    await cleanup();
    await prisma.tenant.create({
      data: { id: tenantId, name: 'Costing Tenant', businessType: 'RETAIL' },
    });
    await prisma.user.create({
      data: {
        id: userId,
        email: 'costing-integration@example.invalid',
        password: 'integration-only',
        tenantId,
      },
    });
    await prisma.supplier.create({
      data: { id: supplierId, name: 'Costing Supplier', tenantId },
    });
    await prisma.warehouse.createMany({
      data: [
        {
          id: warehouseA,
          name: 'Costing Warehouse A',
          code: 'COST-A',
          tenantId,
        },
        {
          id: warehouseB,
          name: 'Costing Warehouse B',
          code: 'COST-B',
          tenantId,
        },
      ],
    });
    await prisma.inventoryItem.createMany({
      data: [
        {
          id: fifoItemId,
          code: 'COST-FIFO',
          name: 'FIFO Item',
          type: 'MATERIAL',
          tenantId,
        },
        {
          id: averageItemId,
          code: 'COST-AVERAGE',
          name: 'Average Item',
          type: 'MATERIAL',
          tenantId,
        },
      ],
    });
  });

  beforeEach(async () => {
    await prisma.purchaseOrderReceiptItem.deleteMany({
      where: { receiptId: historicalReceiptId },
    });
    await prisma.purchaseOrderReceipt.deleteMany({
      where: { id: historicalReceiptId },
    });
    await prisma.purchaseOrderItem.deleteMany({
      where: { id: historicalPurchaseOrderItemId },
    });
    await prisma.purchaseOrder.deleteMany({
      where: { id: historicalPurchaseOrderId },
    });
    await prisma.warehouseTransferReceipt.deleteMany({ where: { tenantId } });
    await prisma.warehouseTransfer.deleteMany({ where: { tenantId } });
    await prisma.outboxEvent.deleteMany({
      where: { tenantId, type: { startsWith: 'warehouse-transfer.' } },
    });
    await prisma.inventoryMovement.deleteMany({ where: { tenantId } });
    await prisma.salesOrder.deleteMany({
      where: { id: completedLegacyOrderId },
    });
    await prisma.inventoryCostLayer.deleteMany({
      where: { inventoryItemId: { in: [fifoItemId, averageItemId] } },
    });
    await prisma.inventoryStock.deleteMany({
      where: { inventoryItemId: { in: [fifoItemId, averageItemId] } },
    });
    await prisma.inventoryItem.updateMany({
      where: { id: { in: [fifoItemId, averageItemId] } },
      data: {
        valuationMethod: null,
        movingAverageScope: null,
        standardCost: null,
        averageUnitCost: null,
        valuationLockedAt: null,
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('allocates FIFO costs across opening and receipt layers and locks the method', async () => {
    await prisma.inventoryStock.create({
      data: {
        warehouseId: warehouseA,
        inventoryItemId: fifoItemId,
        quantity: 5,
        updatedAt: new Date(),
      },
    });

    const openingPreview = await repository.getValuation(tenantId, fifoItemId);
    expect(openingPreview.balances[0].fifoOpeningCostQuantity.toString()).toBe(
      '5',
    );
    await expect(
      repository.configureValuation(tenantId, fifoItemId, { method: 'FIFO' }),
    ).rejects.toThrow(
      'Opening cost is required for untraceable remaining stock in each warehouse',
    );

    const configured = await repository.configureValuation(
      tenantId,
      fifoItemId,
      {
        method: 'FIFO',
        openingCosts: [{ warehouseId: warehouseA, unitCost: 2 }],
      },
    );
    expect(configured.inventoryItemId).toBe(fifoItemId);
    expect(configured.valuationMethod).toBe('FIFO');
    expect(configured.status).toBe('VALUED');
    expect(configured.totalValue?.toString()).toBe('10');
    expect(configured.balances).toHaveLength(1);

    await repository.stockIn(
      tenantId,
      {
        inventoryItemId: fifoItemId,
        warehouseId: warehouseA,
        quantity: 3,
        unitCost: 4,
      },
      userId,
    );
    const issue = await repository.adjustment(
      tenantId,
      {
        inventoryItemId: fifoItemId,
        warehouseId: warehouseA,
        quantity: -6,
        note: 'FIFO issue',
      },
      userId,
    );

    expect(issue.totalCost?.toString()).toBe('14');
    expect(issue.unitCost?.toString()).toBe('2.333333');
    await expect(
      prisma.inventoryStock.findUnique({
        where: {
          warehouseId_inventoryItemId: {
            warehouseId: warehouseA,
            inventoryItemId: fifoItemId,
          },
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ quantity: 2 }));
    const remainingLayers = await prisma.inventoryCostLayer.aggregate({
      where: { inventoryItemId: fifoItemId },
      _sum: { remainingQuantity: true },
    });
    expect(remainingLayers._sum.remainingQuantity?.toString()).toBe('2');
    await expect(
      repository.configureValuation(tenantId, fifoItemId, {
        method: 'STANDARD_COST',
        standardCost: 1,
      }),
    ).rejects.toThrow('locked after the first costed stock transaction');
  });

  it('reconstructs FIFO from historical PO prices and only asks for untraced remaining stock', async () => {
    await prisma.inventoryStock.create({
      data: {
        warehouseId: warehouseA,
        inventoryItemId: fifoItemId,
        quantity: 3,
        updatedAt: new Date(),
      },
    });
    await prisma.purchaseOrder.create({
      data: {
        id: historicalPurchaseOrderId,
        poNumber: 'COST-HISTORY-PO',
        status: 'RECEIVED',
        supplierId,
        tenantId,
        warehouseId: warehouseA,
        totalAmount: 100,
        updatedAt: new Date(),
        PurchaseOrderItem: {
          create: {
            id: historicalPurchaseOrderItemId,
            inventoryItemId: fifoItemId,
            quantity: 5,
            receivedQuantity: 5,
            unitPrice: 20,
            subtotal: 100,
          },
        },
      },
    });
    await prisma.purchaseOrderReceipt.create({
      data: {
        id: historicalReceiptId,
        tenantId,
        purchaseOrderId: historicalPurchaseOrderId,
        idempotencyKey: 'cost-history-receipt',
        requestHash: 'cost-history-request',
        statusAfter: 'RECEIVED',
        Items: {
          create: {
            tenantId,
            purchaseOrderItemId: historicalPurchaseOrderItemId,
            inventoryItemId: fifoItemId,
            receivedQuantity: 5,
          },
        },
      },
    });
    await prisma.inventoryMovement.createMany({
      data: [
        {
          tenantId,
          warehouseId: warehouseA,
          inventoryItemId: fifoItemId,
          type: 'STOCK_IN',
          referenceType: 'PURCHASE_ORDER_RECEIPT',
          referenceId: historicalReceiptId,
          quantity: 5,
          beforeQuantity: 5,
          afterQuantity: 10,
          createdAt: new Date('2020-01-02T00:00:00.000Z'),
        },
        {
          tenantId,
          warehouseId: warehouseA,
          inventoryItemId: fifoItemId,
          type: 'WASTE',
          quantity: 7,
          beforeQuantity: 10,
          afterQuantity: 3,
          createdAt: new Date('2020-01-03T00:00:00.000Z'),
        },
      ],
    });

    const preview = await repository.getValuation(tenantId, fifoItemId);
    expect(preview.balances[0].traceableFifoQuantity.toString()).toBe('3');
    expect(preview.balances[0].fifoOpeningCostQuantity.toString()).toBe('0');
    expect(preview.balances[0].fifoHistoryReconciled).toBe(true);

    const configured = await repository.configureValuation(
      tenantId,
      fifoItemId,
      { method: 'FIFO' },
    );
    expect(configured.status).toBe('VALUED');
    expect(configured.totalValue?.toString()).toBe('60');
    const layer = await prisma.inventoryCostLayer.findFirst({
      where: { inventoryItemId: fifoItemId },
    });
    expect(layer?.unitCost.toString()).toBe('20');
    expect(layer?.receivedQuantity.toString()).toBe('5');
    expect(layer?.remainingQuantity.toString()).toBe('3');
  });

  it('requires a full explicit opening balance when legacy movements do not reconcile', async () => {
    await prisma.inventoryStock.create({
      data: {
        warehouseId: warehouseA,
        inventoryItemId: fifoItemId,
        quantity: 4,
        updatedAt: new Date(),
      },
    });
    await prisma.inventoryMovement.create({
      data: {
        tenantId,
        warehouseId: warehouseA,
        inventoryItemId: fifoItemId,
        type: 'WASTE',
        quantity: 1,
        beforeQuantity: 8,
        afterQuantity: 7,
      },
    });

    const preview = await repository.getValuation(tenantId, fifoItemId);
    expect(preview.balances[0].fifoHistoryReconciled).toBe(false);
    expect(preview.balances[0].traceableFifoQuantity.toString()).toBe('0');
    expect(preview.balances[0].fifoOpeningCostQuantity.toString()).toBe('4');

    const configured = await repository.configureValuation(
      tenantId,
      fifoItemId,
      {
        method: 'FIFO',
        openingCosts: [{ warehouseId: warehouseA, unitCost: 8 }],
      },
    );
    expect(configured.totalValue?.toString()).toBe('32');
  });

  it('replays costed warehouse receipts and issues for moving average setup', async () => {
    await prisma.inventoryStock.create({
      data: {
        warehouseId: warehouseA,
        inventoryItemId: averageItemId,
        quantity: 3,
        updatedAt: new Date(),
      },
    });
    await prisma.inventoryMovement.createMany({
      data: [
        {
          tenantId,
          warehouseId: warehouseA,
          inventoryItemId: averageItemId,
          type: 'STOCK_IN',
          quantity: 5,
          beforeQuantity: 0,
          afterQuantity: 5,
          unitCost: 10,
          totalCost: 50,
          createdAt: new Date('2020-02-01T00:00:00.000Z'),
        },
        {
          tenantId,
          warehouseId: warehouseA,
          inventoryItemId: averageItemId,
          type: 'WASTE',
          quantity: 2,
          beforeQuantity: 5,
          afterQuantity: 3,
          unitCost: 10,
          totalCost: 20,
          createdAt: new Date('2020-02-02T00:00:00.000Z'),
        },
      ],
    });

    const preview = await repository.getValuation(tenantId, averageItemId);
    expect(preview.balances[0].movingAverageWarehouseHistoryReconciled).toBe(
      true,
    );
    expect(preview.balances[0].movingAverageWarehouseUnitCost?.toString()).toBe(
      '10',
    );
    expect(
      preview.balances[0].movingAverageWarehouseOpeningCostQuantity.toString(),
    ).toBe('0');

    const configured = await repository.configureValuation(
      tenantId,
      averageItemId,
      {
        method: 'MOVING_WEIGHTED_AVERAGE',
        movingAverageScope: 'PER_WAREHOUSE',
      },
    );
    expect(configured.balances[0].averageUnitCost?.toString()).toBe('10');
    expect(configured.totalValue?.toString()).toBe('30');
  });

  it('uses historical purchase-order prices when replaying moving average', async () => {
    await prisma.inventoryStock.create({
      data: {
        warehouseId: warehouseA,
        inventoryItemId: averageItemId,
        quantity: 3,
        updatedAt: new Date(),
      },
    });
    await prisma.purchaseOrder.create({
      data: {
        id: historicalPurchaseOrderId,
        poNumber: 'COST-HISTORY-AVERAGE-PO',
        status: 'RECEIVED',
        supplierId,
        tenantId,
        warehouseId: warehouseA,
        totalAmount: 100,
        updatedAt: new Date(),
        PurchaseOrderItem: {
          create: {
            id: historicalPurchaseOrderItemId,
            inventoryItemId: averageItemId,
            quantity: 5,
            receivedQuantity: 5,
            unitPrice: 20,
            subtotal: 100,
          },
        },
      },
    });
    await prisma.purchaseOrderReceipt.create({
      data: {
        id: historicalReceiptId,
        tenantId,
        purchaseOrderId: historicalPurchaseOrderId,
        idempotencyKey: 'cost-history-average-receipt',
        requestHash: 'cost-history-average-request',
        statusAfter: 'RECEIVED',
        Items: {
          create: {
            tenantId,
            purchaseOrderItemId: historicalPurchaseOrderItemId,
            inventoryItemId: averageItemId,
            receivedQuantity: 5,
          },
        },
      },
    });
    await prisma.inventoryMovement.createMany({
      data: [
        {
          tenantId,
          warehouseId: warehouseA,
          inventoryItemId: averageItemId,
          type: 'STOCK_IN',
          referenceType: 'PURCHASE_ORDER_RECEIPT',
          referenceId: historicalReceiptId,
          quantity: 5,
          beforeQuantity: 0,
          afterQuantity: 5,
          createdAt: new Date('2020-04-01T00:00:00.000Z'),
        },
        {
          tenantId,
          warehouseId: warehouseA,
          inventoryItemId: averageItemId,
          type: 'WASTE',
          quantity: 2,
          beforeQuantity: 5,
          afterQuantity: 3,
          createdAt: new Date('2020-04-02T00:00:00.000Z'),
        },
      ],
    });

    const configured = await repository.configureValuation(
      tenantId,
      averageItemId,
      {
        method: 'MOVING_WEIGHTED_AVERAGE',
        movingAverageScope: 'PER_WAREHOUSE',
      },
    );
    expect(configured.balances[0].averageUnitCost?.toString()).toBe('20');
    expect(configured.totalValue?.toString()).toBe('60');
  });

  it('replays moving average across warehouses using chronological receipt costs', async () => {
    await prisma.inventoryStock.createMany({
      data: [
        {
          warehouseId: warehouseA,
          inventoryItemId: averageItemId,
          quantity: 2,
          updatedAt: new Date(),
        },
        {
          warehouseId: warehouseB,
          inventoryItemId: averageItemId,
          quantity: 2,
          updatedAt: new Date(),
        },
      ],
    });
    await prisma.inventoryMovement.createMany({
      data: [
        {
          tenantId,
          warehouseId: warehouseA,
          inventoryItemId: averageItemId,
          type: 'STOCK_IN',
          quantity: 2,
          beforeQuantity: 0,
          afterQuantity: 2,
          unitCost: 10,
          totalCost: 20,
          createdAt: new Date('2020-03-01T00:00:00.000Z'),
        },
        {
          tenantId,
          warehouseId: warehouseB,
          inventoryItemId: averageItemId,
          type: 'STOCK_IN',
          quantity: 3,
          beforeQuantity: 0,
          afterQuantity: 3,
          unitCost: 20,
          totalCost: 60,
          createdAt: new Date('2020-03-02T00:00:00.000Z'),
        },
        {
          tenantId,
          warehouseId: warehouseB,
          inventoryItemId: averageItemId,
          type: 'WASTE',
          quantity: 1,
          beforeQuantity: 3,
          afterQuantity: 2,
          unitCost: 16,
          totalCost: 16,
          createdAt: new Date('2020-03-03T00:00:00.000Z'),
        },
      ],
    });

    const preview = await repository.getValuation(tenantId, averageItemId);
    expect(preview.movingAverageItemHistoryReconciled).toBe(true);
    expect(preview.movingAverageItemUnitCost?.toString()).toBe('16');
    expect(
      preview.balances.every(
        (balance) =>
          balance.movingAverageItemOpeningCostQuantity.toString() === '0',
      ),
    ).toBe(true);

    await repository.configureValuation(tenantId, averageItemId, {
      method: 'MOVING_WEIGHTED_AVERAGE',
      movingAverageScope: 'PER_ITEM',
    });
    const issue = await repository.waste(
      tenantId,
      {
        inventoryItemId: averageItemId,
        warehouseId: warehouseB,
        quantity: 1,
        note: 'Reconstructed average issue',
      },
      userId,
    );
    expect(issue.totalCost?.toString()).toBe('16');
    const valuation = await repository.getValuation(tenantId, averageItemId);
    expect(valuation.averageUnitCost?.toString()).toBe('16');
  });

  it('requires opening cost when moving-average receipt history has no provable cost', async () => {
    await prisma.inventoryStock.create({
      data: {
        warehouseId: warehouseA,
        inventoryItemId: averageItemId,
        quantity: 4,
        updatedAt: new Date(),
      },
    });
    await prisma.inventoryMovement.create({
      data: {
        tenantId,
        warehouseId: warehouseA,
        inventoryItemId: averageItemId,
        type: 'STOCK_IN',
        quantity: 4,
        beforeQuantity: 0,
        afterQuantity: 4,
      },
    });

    const preview = await repository.getValuation(tenantId, averageItemId);
    expect(preview.balances[0].movingAverageWarehouseHistoryReconciled).toBe(
      false,
    );
    expect(
      preview.balances[0].movingAverageWarehouseOpeningCostQuantity.toString(),
    ).toBe('4');
    await expect(
      repository.configureValuation(tenantId, averageItemId, {
        method: 'MOVING_WEIGHTED_AVERAGE',
        movingAverageScope: 'PER_WAREHOUSE',
      }),
    ).rejects.toThrow(
      'Opening cost is required for every warehouse with positive stock',
    );

    const configured = await repository.configureValuation(
      tenantId,
      averageItemId,
      {
        method: 'MOVING_WEIGHTED_AVERAGE',
        movingAverageScope: 'PER_WAREHOUSE',
        openingCosts: [{ warehouseId: warehouseA, unitCost: 8 }],
      },
    );
    expect(configured.balances[0].averageUnitCost?.toString()).toBe('8');
    expect(configured.totalValue?.toString()).toBe('32');
  });

  it('reconstructs transfer receipt FIFO layers from shipment allocations', async () => {
    const transfer = await transfers.create(
      tenantId,
      userId,
      'legacy-transfer-history',
      {
        sourceWarehouseId: warehouseA,
        destinationWarehouseId: warehouseB,
        items: [{ inventoryItemId: fifoItemId, quantity: 2 }],
      },
    );
    const transferItemId = transfer.Items[0].id;
    await prisma.warehouseTransfer.update({
      where: { id: transfer.id },
      data: {
        status: 'IN_TRANSIT',
        shippedAt: new Date('2020-05-01T00:00:00Z'),
      },
    });
    await prisma.warehouseTransferItem.update({
      where: { id: transferItemId },
      data: { receivedQuantity: 2 },
    });
    const receipt = await prisma.warehouseTransferReceipt.create({
      data: {
        tenantId,
        transferId: transfer.id,
        createdById: userId,
        idempotencyKey: 'legacy-transfer-receipt',
        requestHash: 'legacy-transfer-receipt-hash',
        createdAt: new Date('2020-05-02T00:00:00Z'),
        Items: {
          create: {
            tenantId,
            transferItemId,
            inventoryItemId: fifoItemId,
            receivedQuantity: 1,
          },
        },
      },
    });
    const secondReceipt = await prisma.warehouseTransferReceipt.create({
      data: {
        tenantId,
        transferId: transfer.id,
        createdById: userId,
        idempotencyKey: 'legacy-transfer-receipt-second',
        requestHash: 'legacy-transfer-receipt-second-hash',
        createdAt: new Date('2020-05-03T00:00:00Z'),
        Items: {
          create: {
            tenantId,
            transferItemId,
            inventoryItemId: fifoItemId,
            receivedQuantity: 1,
          },
        },
      },
    });
    await prisma.inventoryStock.createMany({
      data: [
        {
          warehouseId: warehouseA,
          inventoryItemId: fifoItemId,
          quantity: 3,
          updatedAt: new Date(),
        },
        {
          warehouseId: warehouseB,
          inventoryItemId: fifoItemId,
          quantity: 2,
          updatedAt: new Date(),
        },
      ],
    });
    const shipment = await prisma.inventoryMovement.create({
      data: {
        tenantId,
        warehouseId: warehouseA,
        inventoryItemId: fifoItemId,
        type: 'TRANSFER',
        quantity: 2,
        beforeQuantity: 5,
        afterQuantity: 3,
        referenceType: 'WAREHOUSE_TRANSFER_SHIPMENT',
        referenceId: transfer.id,
        createdAt: new Date('2020-05-01T00:00:00Z'),
      },
    });
    await prisma.inventoryMovement.create({
      data: {
        tenantId,
        warehouseId: warehouseB,
        inventoryItemId: fifoItemId,
        type: 'TRANSFER',
        quantity: 1,
        beforeQuantity: 0,
        afterQuantity: 1,
        referenceType: 'WAREHOUSE_TRANSFER_RECEIPT',
        referenceId: receipt.id,
        createdAt: new Date('2020-05-02T00:00:00Z'),
      },
    });
    await prisma.inventoryMovement.create({
      data: {
        tenantId,
        warehouseId: warehouseB,
        inventoryItemId: fifoItemId,
        type: 'TRANSFER',
        quantity: 1,
        beforeQuantity: 1,
        afterQuantity: 2,
        referenceType: 'WAREHOUSE_TRANSFER_RECEIPT',
        referenceId: secondReceipt.id,
        createdAt: new Date('2020-05-03T00:00:00Z'),
      },
    });
    await prisma.inventoryMovementCostAllocation.createMany({
      data: [
        { movementId: shipment.id, quantity: 1, unitCost: 3 },
        { movementId: shipment.id, quantity: 1, unitCost: 5 },
      ],
    });

    const preview = await repository.getValuation(tenantId, fifoItemId);
    const destinationBalance = preview.balances.find(
      (balance) => balance.warehouseId === warehouseB,
    );
    expect(destinationBalance?.movingAverageWarehouseUnitCost?.toString()).toBe(
      '4',
    );
    expect(destinationBalance?.movingAverageWarehouseHistoryReconciled).toBe(
      true,
    );

    const configured = await repository.configureValuation(
      tenantId,
      fifoItemId,
      {
        method: 'FIFO',
        openingCosts: [{ warehouseId: warehouseA, unitCost: 2 }],
      },
    );
    expect(configured.totalValue?.toString()).toBe('14');
    const destinationLayers = await prisma.inventoryCostLayer.findMany({
      where: { inventoryItemId: fifoItemId, warehouseId: warehouseB },
      orderBy: { unitCost: 'asc' },
    });
    expect(
      destinationLayers.map((layer) => [
        layer.remainingQuantity.toString(),
        layer.unitCost.toString(),
      ]),
    ).toEqual([
      ['1', '3'],
      ['1', '5'],
    ]);
  });

  it('reconstructs reservation release FIFO layers from original allocations', async () => {
    await prisma.inventoryStock.create({
      data: {
        warehouseId: warehouseA,
        inventoryItemId: fifoItemId,
        quantity: 5,
        updatedAt: new Date(),
      },
    });
    const firstReceipt = await prisma.inventoryMovement.create({
      data: {
        tenantId,
        warehouseId: warehouseA,
        inventoryItemId: fifoItemId,
        type: 'STOCK_IN',
        quantity: 1,
        beforeQuantity: 0,
        afterQuantity: 1,
        unitCost: 3,
        totalCost: 3,
        createdAt: new Date('2020-05-31T00:00:00Z'),
      },
    });
    const secondReceipt = await prisma.inventoryMovement.create({
      data: {
        tenantId,
        warehouseId: warehouseA,
        inventoryItemId: fifoItemId,
        type: 'STOCK_IN',
        quantity: 4,
        beforeQuantity: 1,
        afterQuantity: 5,
        unitCost: 5,
        totalCost: 20,
        createdAt: new Date('2020-05-31T01:00:00Z'),
      },
    });
    const [firstLayer, secondLayer] = await Promise.all([
      prisma.inventoryCostLayer.create({
        data: {
          tenantId,
          inventoryItemId: fifoItemId,
          warehouseId: warehouseA,
          sourceMovementId: firstReceipt.id,
          sourceType: 'STOCK_IN',
          receivedQuantity: 1,
          remainingQuantity: 0,
          unitCost: 3,
        },
      }),
      prisma.inventoryCostLayer.create({
        data: {
          tenantId,
          inventoryItemId: fifoItemId,
          warehouseId: warehouseA,
          sourceMovementId: secondReceipt.id,
          sourceType: 'STOCK_IN',
          receivedQuantity: 4,
          remainingQuantity: 0,
          unitCost: 5,
        },
      }),
    ]);
    const reservation = await prisma.inventoryMovement.create({
      data: {
        tenantId,
        warehouseId: warehouseA,
        inventoryItemId: fifoItemId,
        type: 'STOCK_OUT',
        quantity: 2,
        beforeQuantity: 5,
        afterQuantity: 3,
        referenceType: 'ORDER_RESERVATION_RELEASED',
        referenceId: 'legacy-release-order',
        createdAt: new Date('2020-06-01T00:00:00Z'),
      },
    });
    await prisma.inventoryMovement.create({
      data: {
        tenantId,
        warehouseId: warehouseA,
        inventoryItemId: fifoItemId,
        type: 'RETURN',
        quantity: 2,
        beforeQuantity: 3,
        afterQuantity: 5,
        referenceType: 'ORDER_RESERVATION_RELEASE',
        referenceId: 'legacy-release-order',
        createdAt: new Date('2020-06-02T00:00:00Z'),
      },
    });
    await prisma.inventoryMovementCostAllocation.createMany({
      data: [
        {
          movementId: reservation.id,
          costLayerId: firstLayer.id,
          quantity: 1,
          unitCost: 3,
        },
        {
          movementId: reservation.id,
          costLayerId: secondLayer.id,
          quantity: 1,
          unitCost: 5,
        },
      ],
    });

    const preview = await repository.getValuation(tenantId, fifoItemId);
    expect(preview.balances[0].movingAverageWarehouseUnitCost?.toString()).toBe(
      '4.36',
    );
    expect(preview.balances[0].movingAverageWarehouseHistoryReconciled).toBe(
      true,
    );
    expect(
      preview.balances[0].movingAverageWarehouseOpeningCostQuantity.toString(),
    ).toBe('0');

    const configured = await repository.configureValuation(
      tenantId,
      fifoItemId,
      {
        method: 'FIFO',
      },
    );
    expect(configured.totalValue?.toString()).toBe('23');
    const fifoLayers = await prisma.inventoryCostLayer.findMany({
      where: {
        inventoryItemId: fifoItemId,
        sourceType: 'HISTORICAL_RECONSTRUCTION',
      },
      orderBy: [{ createdAt: 'asc' }, { unitCost: 'asc' }],
    });
    expect(
      fifoLayers.map((layer) => [
        layer.remainingQuantity.toString(),
        layer.unitCost.toString(),
      ]),
    ).toEqual([
      ['1', '3'],
      ['4', '5'],
    ]);
    const nextIssue = await repository.waste(
      tenantId,
      {
        inventoryItemId: fifoItemId,
        warehouseId: warehouseA,
        quantity: 1,
        note: 'Issue after reservation release',
      },
      userId,
    );
    expect(nextIssue.totalCost?.toString()).toBe('3');
  });

  it('maintains a cross-warehouse moving average through receipt and issue', async () => {
    await prisma.inventoryStock.createMany({
      data: [
        {
          warehouseId: warehouseA,
          inventoryItemId: averageItemId,
          quantity: 2,
          updatedAt: new Date(),
        },
        {
          warehouseId: warehouseB,
          inventoryItemId: averageItemId,
          quantity: 3,
          updatedAt: new Date(),
        },
      ],
    });
    await repository.configureValuation(tenantId, averageItemId, {
      method: 'MOVING_WEIGHTED_AVERAGE',
      movingAverageScope: 'PER_ITEM',
      openingCosts: [
        { warehouseId: warehouseA, unitCost: 10 },
        { warehouseId: warehouseB, unitCost: 20 },
      ],
    });

    await repository.stockIn(
      tenantId,
      {
        inventoryItemId: averageItemId,
        warehouseId: warehouseA,
        quantity: 1,
        unitCost: 22,
      },
      userId,
    );
    const issue = await repository.waste(
      tenantId,
      {
        inventoryItemId: averageItemId,
        warehouseId: warehouseB,
        quantity: 1,
        note: 'Average cost waste',
      },
      userId,
    );

    expect(issue.totalCost?.toString()).toBe('17');
    const valuation = await repository.getValuation(tenantId, averageItemId);
    expect(valuation.averageUnitCost?.toString()).toBe('17');
    expect(valuation.totalQuantity).toBe(5);
  });

  it('includes active legacy reservations in valuation setup without blocking it', async () => {
    await prisma.inventoryStock.create({
      data: {
        warehouseId: warehouseA,
        inventoryItemId: averageItemId,
        quantity: 4,
        updatedAt: new Date(),
      },
    });
    await prisma.inventoryMovement.create({
      data: {
        tenantId,
        warehouseId: warehouseA,
        inventoryItemId: averageItemId,
        type: 'STOCK_OUT',
        referenceType: 'ORDER_RESERVATION',
        referenceId: 'legacy-reservation',
        quantity: 1,
        beforeQuantity: 5,
        afterQuantity: 4,
      },
    });

    const configured = await repository.configureValuation(
      tenantId,
      averageItemId,
      {
        method: 'FIFO',
        openingCosts: [{ warehouseId: warehouseA, unitCost: 1 }],
      },
    );
    expect(configured).toEqual(
      expect.objectContaining({
        valuationMethod: 'FIFO',
        totalQuantity: 5,
      }),
    );
    expect(configured.totalValue?.toString()).toBe('5');
    await expect(
      prisma.inventoryMovement.findFirst({
        where: {
          inventoryItemId: averageItemId,
          referenceType: 'ORDER_RESERVATION',
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ unitCost: null }));
  });

  it('reconciles completed legacy reservations before configuring valuation', async () => {
    await prisma.inventoryStock.create({
      data: {
        warehouseId: warehouseA,
        inventoryItemId: averageItemId,
        quantity: 4,
        updatedAt: new Date(),
      },
    });
    await prisma.salesOrder.create({
      data: {
        id: completedLegacyOrderId,
        orderNumber: completedLegacyOrderId,
        status: 'COMPLETED',
        totalAmount: 1,
        tenantId,
      },
    });
    await prisma.inventoryMovement.create({
      data: {
        tenantId,
        warehouseId: warehouseA,
        inventoryItemId: averageItemId,
        type: 'STOCK_OUT',
        referenceType: 'ORDER_RESERVATION',
        referenceId: completedLegacyOrderId,
        quantity: 1,
        beforeQuantity: 5,
        afterQuantity: 4,
      },
    });

    await expect(
      repository.configureValuation(tenantId, averageItemId, {
        method: 'STANDARD_COST',
        standardCost: 1,
      }),
    ).resolves.toEqual(
      expect.objectContaining({ valuationMethod: 'STANDARD_COST' }),
    );

    await expect(
      prisma.inventoryMovement.findFirst({
        where: {
          inventoryItemId: averageItemId,
          referenceId: completedLegacyOrderId,
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        referenceType: 'ORDER_RESERVATION_COMMITTED',
        type: 'SALE',
      }),
    );
  });

  it('preserves FIFO costs across a warehouse transfer with partial receipts', async () => {
    await prisma.inventoryStock.create({
      data: {
        warehouseId: warehouseA,
        inventoryItemId: fifoItemId,
        quantity: 5,
        updatedAt: new Date(),
      },
    });
    await repository.configureValuation(tenantId, fifoItemId, {
      method: 'FIFO',
      openingCosts: [{ warehouseId: warehouseA, unitCost: 3 }],
    });
    const transfer = await transfers.create(
      tenantId,
      userId,
      'fifo-partial-transfer',
      {
        sourceWarehouseId: warehouseA,
        destinationWarehouseId: warehouseB,
        items: [{ inventoryItemId: fifoItemId, quantity: 4 }],
      },
    );
    const shipped = await transfers.ship(tenantId, transfer.id, userId);
    const transferItemId = shipped.Items[0].id;

    await transfers.receive(tenantId, transfer.id, userId, 'fifo-receipt-1', {
      items: [{ transferItemId, receivedQuantity: 1.5 }],
    });
    await transfers.receive(tenantId, transfer.id, userId, 'fifo-receipt-2', {
      items: [{ transferItemId, receivedQuantity: 2.5 }],
    });

    const destinationLayers = await prisma.inventoryCostLayer.aggregate({
      where: {
        inventoryItemId: fifoItemId,
        warehouseId: warehouseB,
      },
      _sum: { remainingQuantity: true },
      _avg: { unitCost: true },
    });
    expect(destinationLayers._sum.remainingQuantity?.toString()).toBe('4');
    expect(destinationLayers._avg.unitCost?.toString()).toBe('3');
    const receipts = await prisma.warehouseTransferReceipt.findMany({
      where: { transferId: transfer.id },
      select: { id: true },
    });
    const receiptMovements = await prisma.inventoryMovement.findMany({
      where: {
        tenantId,
        warehouseId: warehouseB,
        referenceType: 'WAREHOUSE_TRANSFER_RECEIPT',
        referenceId: { in: receipts.map((receipt) => receipt.id) },
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(
      receiptMovements.map((movement) => movement.totalCost?.toString()).sort(),
    ).toEqual(['4.5', '7.5']);
    expect(
      receiptMovements.map((movement) => movement.unitCost?.toString()),
    ).toEqual(['3', '3']);
  });
});
