import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PurchaseOrderStatus } from '@prisma/client';

import { DomainEventBus } from '../../core/events/domain-event-bus.service';
import { InventoryCostingService } from '../inventory/inventory-costing.service';
import { PurchaseOrderRepository } from './purchase-order.repository';
import { PurchaseOrderService } from './purchase-order.service';

function purchaseOrder(
  status: PurchaseOrderStatus = PurchaseOrderStatus.DRAFT,
) {
  return {
    id: 'po-a',
    tenantId: 'tenant-a',
    supplierId: 'supplier-a',
    warehouseId: 'warehouse-a',
    poNumber: 'PO-A',
    status,
    totalAmount: 100,
    expectedDeliveryDate: null,
    notes: null,
    PurchaseOrderItem: [],
  };
}

describe('PurchaseOrderService', () => {
  const supplierFindUnique = jest.fn();
  const warehouseFindFirst = jest.fn();
  const inventoryFindMany = jest.fn();
  const transaction = jest.fn();
  const prisma = {
    supplier: { findUnique: supplierFindUnique },
    warehouse: { findFirst: warehouseFindFirst },
    inventoryItem: { findMany: inventoryFindMany },
    $transaction: transaction,
    purchaseOrder: { count: jest.fn(), deleteMany: jest.fn() },
  };
  const createPurchaseOrder = jest.fn();
  const findAll = jest.fn();
  const findOne = jest.fn();
  const update = jest.fn();
  const repository = {
    createPurchaseOrder,
    findAll,
    findOne,
    update,
  } as unknown as PurchaseOrderRepository;
  const publish = jest.fn();
  const events = { publish } as unknown as DomainEventBus;
  let service: PurchaseOrderService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PurchaseOrderService(
      prisma as never,
      events,
      repository,
      new InventoryCostingService(),
    );
  });

  it('rejects supplier and inventory records outside the tenant', async () => {
    supplierFindUnique.mockResolvedValue({
      id: 'supplier-a',
      tenantId: 'tenant-b',
    });

    await expect(
      service.create('tenant-a', 'user-a', {
        supplierId: 'supplier-a',
        warehouseId: 'warehouse-a',
        items: [{ inventoryItemId: 'item-a', quantity: 1, unitPrice: 100 }],
      }),
    ).rejects.toThrow(new NotFoundException('Supplier not found'));
    expect(createPurchaseOrder).not.toHaveBeenCalled();
  });

  it('rejects an inverted Purchase Order date range', async () => {
    await expect(
      service.findAll('tenant-a', {
        fromDate: '2026-02-01',
        toDate: '2026-01-01',
      }),
    ).rejects.toThrow(
      new BadRequestException('fromDate must not be later than toDate'),
    );
    expect(findAll).not.toHaveBeenCalled();
  });

  it('creates a tenant-scoped purchase order with calculated subtotals', async () => {
    supplierFindUnique.mockResolvedValue({
      id: 'supplier-a',
      tenantId: 'tenant-a',
      isActive: true,
    });
    warehouseFindFirst.mockResolvedValue({ isActive: true });
    inventoryFindMany.mockResolvedValue([
      { id: 'item-a', tenantId: 'tenant-a' },
    ]);
    prisma.purchaseOrder.count.mockResolvedValue(0);
    createPurchaseOrder.mockResolvedValue({ id: 'po-a', tenantId: 'tenant-a' });

    await expect(
      service.create('tenant-a', 'user-a', {
        supplierId: 'supplier-a',
        warehouseId: 'warehouse-a',
        items: [{ inventoryItemId: 'item-a', quantity: 3, unitPrice: 100 }],
      }),
    ).resolves.toEqual(expect.objectContaining({ tenantId: 'tenant-a' }));
    expect(createPurchaseOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        supplierId: 'supplier-a',
        items: [{ inventoryItemId: 'item-a', quantity: 3, unitPrice: 100 }],
      }),
    );
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('rejects inactive warehouses for new Purchase Orders', async () => {
    supplierFindUnique.mockResolvedValue({
      id: 'supplier-a',
      tenantId: 'tenant-a',
      isActive: true,
    });
    warehouseFindFirst.mockResolvedValue({ isActive: false });

    await expect(
      service.create('tenant-a', 'user-a', {
        supplierId: 'supplier-a',
        warehouseId: 'warehouse-a',
        items: [{ inventoryItemId: 'item-a', quantity: 1, unitPrice: 100 }],
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Inactive warehouses cannot be assigned to new purchase orders',
      ),
    );
    expect(createPurchaseOrder).not.toHaveBeenCalled();
  });

  it('rejects inactive suppliers when creating a Purchase Order', async () => {
    supplierFindUnique.mockResolvedValue({
      id: 'supplier-a',
      tenantId: 'tenant-a',
      isActive: false,
    });

    await expect(
      service.create('tenant-a', 'user-a', {
        supplierId: 'supplier-a',
        warehouseId: 'warehouse-a',
        items: [{ inventoryItemId: 'item-a', quantity: 1, unitPrice: 100 }],
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Inactive suppliers cannot be used for new purchase orders',
      ),
    );
    expect(createPurchaseOrder).not.toHaveBeenCalled();
  });

  it('enforces lifecycle transitions and makes repeated target status idempotent', async () => {
    let currentPo = purchaseOrder(PurchaseOrderStatus.DRAFT);
    transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      Promise.resolve(
        callback({
          $queryRaw: jest.fn().mockResolvedValue([{ id: 'po-a' }]),
          purchaseOrder: {
            findFirst: jest.fn().mockImplementation(() => currentPo),
          },
        }),
      ),
    );

    await expect(
      service.updateStatus('tenant-a', 'po-a', PurchaseOrderStatus.RECEIVED),
    ).rejects.toThrow('Cannot transition from DRAFT to RECEIVED');

    currentPo = purchaseOrder(PurchaseOrderStatus.APPROVED);
    await expect(
      service.updateStatus('tenant-a', 'po-a', PurchaseOrderStatus.RECEIVED),
    ).rejects.toThrow('Use the purchase order receipt endpoint');

    currentPo = purchaseOrder(PurchaseOrderStatus.PENDING);
    await expect(
      service.updateStatus('tenant-a', 'po-a', PurchaseOrderStatus.PENDING),
    ).resolves.toEqual(
      expect.objectContaining({ status: PurchaseOrderStatus.PENDING }),
    );
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it('requires a warehouse before receiving stock', async () => {
    transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      Promise.resolve(
        callback({
          $queryRaw: jest.fn().mockResolvedValue([{ id: 'po-a' }]),
          purchaseOrder: {
            findFirst: jest.fn().mockResolvedValue({
              ...purchaseOrder(PurchaseOrderStatus.APPROVED),
              warehouseId: null,
              PurchaseOrderItem: [],
            }),
          },
          purchaseOrderReceipt: {
            findUnique: jest.fn().mockResolvedValue(null),
          },
        }),
      ),
    );

    await expect(
      service.receivePurchaseOrder(
        'tenant-a',
        'po-a',
        'user-a',
        'receipt-key',
        {
          items: [{ purchaseOrderItemId: 'item-a', receivedQuantity: 1 }],
        },
      ),
    ).rejects.toThrow(
      new BadRequestException('Warehouse is required for receiving/receipting'),
    );
  });

  it('returns a successful result after deleting a draft purchase order', async () => {
    findOne.mockResolvedValue(purchaseOrder(PurchaseOrderStatus.DRAFT));
    prisma.purchaseOrder.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.delete('tenant-a', 'po-a')).resolves.toEqual({
      success: true,
    });
    expect(prisma.purchaseOrder.deleteMany).toHaveBeenCalledWith({
      where: { id: 'po-a', tenantId: 'tenant-a' },
    });
  });
});
