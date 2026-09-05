import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PurchaseOrderStatus } from '@prisma/client';

import { DomainEventBus } from '../../core/events/domain-event-bus.service';
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
  const inventoryFindMany = jest.fn();
  const transaction = jest.fn();
  const prisma = {
    supplier: { findUnique: supplierFindUnique },
    inventoryItem: { findMany: inventoryFindMany },
    $transaction: transaction,
    purchaseOrder: { count: jest.fn() },
  };
  const createPurchaseOrder = jest.fn();
  const findOne = jest.fn();
  const update = jest.fn();
  const repository = {
    createPurchaseOrder,
    findOne,
    update,
  } as unknown as PurchaseOrderRepository;
  const publish = jest.fn();
  const events = { publish } as unknown as DomainEventBus;
  let service: PurchaseOrderService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PurchaseOrderService(prisma as never, events, repository);
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

  it('creates a tenant-scoped purchase order with calculated subtotals', async () => {
    supplierFindUnique.mockResolvedValue({
      id: 'supplier-a',
      tenantId: 'tenant-a',
    });
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

  it('enforces lifecycle transitions and makes repeated target status idempotent', async () => {
    findOne.mockResolvedValue(purchaseOrder(PurchaseOrderStatus.DRAFT));

    await expect(
      service.updateStatus('tenant-a', 'po-a', PurchaseOrderStatus.RECEIVED),
    ).rejects.toThrow('Cannot transition from DRAFT to RECEIVED');

    findOne.mockResolvedValue(purchaseOrder(PurchaseOrderStatus.PENDING));
    await expect(
      service.updateStatus('tenant-a', 'po-a', PurchaseOrderStatus.PENDING),
    ).resolves.toEqual(
      expect.objectContaining({ status: PurchaseOrderStatus.PENDING }),
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('requires a warehouse before receiving stock', async () => {
    findOne.mockResolvedValue({
      ...purchaseOrder(PurchaseOrderStatus.APPROVED),
      warehouseId: null,
    });
    transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      Promise.resolve(
        callback({
          purchaseOrder: {
            findFirst: jest.fn().mockResolvedValue({
              ...purchaseOrder(PurchaseOrderStatus.APPROVED),
              warehouseId: null,
              PurchaseOrderItem: [],
            }),
          },
        }),
      ),
    );

    await expect(
      service.updateStatus('tenant-a', 'po-a', PurchaseOrderStatus.RECEIVED),
    ).rejects.toThrow(
      new BadRequestException('Warehouse is required for receiving/receipting'),
    );
  });
});
