import { AggregateRoot } from '../../../core/domain/aggregate-root';
import { PurchaseOrderStatus, Prisma } from '@prisma/client';

export type PurchaseOrderItemProps = {
  inventoryItemId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

export type PurchaseOrderProps = {
  id: string;
  poNumber: string;
  status: PurchaseOrderStatus;
  supplierId: string;
  tenantId: string;
  warehouseId?: string | null;
  expectedDeliveryDate?: Date | null;
  totalAmount: number;
  notes?: string | null;
  receivedAt?: Date | null;
  completedAt?: Date | null;
  items: PurchaseOrderItemProps[];
  createdAt: Date;
  updatedAt: Date;
};

export class PurchaseOrderAggregate extends AggregateRoot {
  private constructor(private props: PurchaseOrderProps) {
    super();
  }

  static create(props: PurchaseOrderProps) {
    if (!props.supplierId.trim()) {
      throw new Error('Supplier is required');
    }

    if (!props.items || props.items.length === 0) {
      throw new Error('Purchase order must include at least one item');
    }

    const duplicateInventoryItemIds = new Set(
      props.items.map((item) => item.inventoryItemId),
    );

    if (duplicateInventoryItemIds.size !== props.items.length) {
      throw new Error('Purchase order contains duplicate inventory items');
    }

    props.items.forEach((item) => {
      if (!item.inventoryItemId.trim()) {
        throw new Error('Inventory item id must not be empty');
      }

      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new Error(
          'Purchase order item quantity must be a positive integer',
        );
      }

      if (!Number.isInteger(item.unitPrice) || item.unitPrice < 0) {
        throw new Error(
          'Purchase order item unit price must be a non-negative integer',
        );
      }

      if (item.subtotal !== item.quantity * item.unitPrice) {
        throw new Error(
          'Purchase order item subtotal must equal quantity times unit price',
        );
      }
    });

    return new PurchaseOrderAggregate(props);
  }

  static fromPersistence(
    purchaseOrder: Prisma.PurchaseOrderGetPayload<{
      include: {
        PurchaseOrderItem: true;
      };
    }>,
  ) {
    return new PurchaseOrderAggregate({
      id: purchaseOrder.id,
      poNumber: purchaseOrder.poNumber,
      status: purchaseOrder.status,
      supplierId: purchaseOrder.supplierId,
      tenantId: purchaseOrder.tenantId,
      warehouseId: purchaseOrder.warehouseId,
      expectedDeliveryDate: purchaseOrder.expectedDeliveryDate,
      totalAmount: purchaseOrder.totalAmount,
      notes: purchaseOrder.notes,
      receivedAt: purchaseOrder.receivedAt,
      completedAt: purchaseOrder.completedAt,
      items: purchaseOrder.PurchaseOrderItem.map((item) => ({
        inventoryItemId: item.inventoryItemId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
      })),
      createdAt: purchaseOrder.createdAt,
      updatedAt: purchaseOrder.updatedAt,
    });
  }

  get id(): string {
    return this.props.id;
  }

  get poNumber(): string {
    return this.props.poNumber;
  }

  get status(): PurchaseOrderStatus {
    return this.props.status;
  }

  get supplierId(): string {
    return this.props.supplierId;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get warehouseId(): string | null | undefined {
    return this.props.warehouseId;
  }

  get expectedDeliveryDate(): Date | null | undefined {
    return this.props.expectedDeliveryDate;
  }

  get totalAmount(): number {
    return this.props.totalAmount;
  }

  get notes(): string | null | undefined {
    return this.props.notes;
  }

  get receivedAt(): Date | null | undefined {
    return this.props.receivedAt;
  }

  get completedAt(): Date | null | undefined {
    return this.props.completedAt;
  }

  get items(): PurchaseOrderItemProps[] {
    return this.props.items;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get persisted(): PurchaseOrderProps {
    return this.props;
  }

  transitionStatus(status: PurchaseOrderStatus) {
    if (this.props.status === status) {
      return;
    }

    if (this.props.status === PurchaseOrderStatus.CANCELLED) {
      throw new Error('Cannot transition a cancelled purchase order');
    }

    if (this.props.status === PurchaseOrderStatus.COMPLETED) {
      throw new Error('Cannot transition a completed purchase order');
    }

    const validTransitions: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> =
      {
        [PurchaseOrderStatus.DRAFT]: [
          PurchaseOrderStatus.PENDING,
          PurchaseOrderStatus.CANCELLED,
        ],
        [PurchaseOrderStatus.PENDING]: [
          PurchaseOrderStatus.APPROVED,
          PurchaseOrderStatus.REJECTED,
          PurchaseOrderStatus.CANCELLED,
        ],
        [PurchaseOrderStatus.APPROVED]: [
          PurchaseOrderStatus.PARTIALLY_RECEIVED,
          PurchaseOrderStatus.RECEIVED,
          PurchaseOrderStatus.CANCELLED,
        ],
        [PurchaseOrderStatus.PARTIALLY_RECEIVED]: [
          PurchaseOrderStatus.RECEIVED,
          PurchaseOrderStatus.CANCELLED,
        ],
        [PurchaseOrderStatus.RECEIVED]: [PurchaseOrderStatus.COMPLETED],
        [PurchaseOrderStatus.REJECTED]: [PurchaseOrderStatus.CANCELLED],
        [PurchaseOrderStatus.CANCELLED]: [],
        [PurchaseOrderStatus.COMPLETED]: [],
      };

    const allowed = validTransitions[this.props.status] ?? [];

    if (!allowed.includes(status)) {
      throw new Error(
        `Cannot transition purchase order from ${this.props.status} to ${status}`,
      );
    }

    this.props = {
      ...this.props,
      status,
      updatedAt: new Date(),
      receivedAt:
        status === PurchaseOrderStatus.RECEIVED
          ? new Date()
          : this.props.receivedAt,
      completedAt:
        status === PurchaseOrderStatus.COMPLETED
          ? new Date()
          : this.props.completedAt,
    };
  }

  toPersistence() {
    return {
      id: this.id,
      poNumber: this.poNumber,
      status: this.status,
      supplierId: this.supplierId,
      tenantId: this.tenantId,
      warehouseId: this.warehouseId,
      expectedDeliveryDate: this.expectedDeliveryDate,
      totalAmount: this.totalAmount,
      notes: this.notes,
      receivedAt: this.receivedAt,
      completedAt: this.completedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
