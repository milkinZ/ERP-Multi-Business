import { AggregateRoot } from '../../../core/domain/aggregate-root';
import { PurchaseOrderStatus, Prisma } from '@prisma/client';

export type PurchaseOrderItemProps = {
  inventoryItemId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  receivedQuantity: number;
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

type Receipt = {
  inventoryItemId: string;
  receivedQuantity: number; // cumulative receivedQuantity after this operation
};

type ReceivingMovementSpec = {
  inventoryItemId: string;
  deltaQuantity: number;
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

      if (
        !Number.isInteger(item.receivedQuantity) ||
        item.receivedQuantity < 0
      ) {
        throw new Error('Purchase order item receivedQuantity must be >= 0');
      }

      if (item.receivedQuantity > item.quantity) {
        throw new Error('receivedQuantity cannot exceed ordered quantity');
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
        receivedQuantity: item.receivedQuantity,
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

  getPersistedSnapshot(): PurchaseOrderProps {
    return this.props;
  }

  private assertNotCancelledOrCompleted() {
    if (this.props.status === PurchaseOrderStatus.CANCELLED) {
      throw new Error('Cannot transition a cancelled purchase order');
    }
    if (this.props.status === PurchaseOrderStatus.COMPLETED) {
      throw new Error('Cannot transition a completed purchase order');
    }
  }

  get remainingByItem(): Record<string, number> {
    const result: Record<string, number> = {};

    for (const item of this.props.items) {
      const remaining = item.quantity - item.receivedQuantity;
      result[item.inventoryItemId] = remaining;
    }

    return result;
  }

  /**
   * Allowed lifecycle transitions.
   */
  private assertAllowedTransition(to: PurchaseOrderStatus) {
    if (to === this.props.status) {
      return;
    }

    this.assertNotCancelledOrCompleted();

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

    if (!allowed.includes(to)) {
      throw new Error(
        `Cannot transition purchase order from ${this.props.status} to ${to}`,
      );
    }
  }

  transitionTo(to: PurchaseOrderStatus) {
    if (to === this.props.status) {
      return;
    }

    this.assertAllowedTransition(to);

    const now = new Date();
    this.props = {
      ...this.props,
      status: to,
      updatedAt: now,
      receivedAt:
        to === PurchaseOrderStatus.RECEIVED ? now : this.props.receivedAt,
      completedAt:
        to === PurchaseOrderStatus.COMPLETED ? now : this.props.completedAt,
    };
  }

  // 1) Lifecycle transitions
  pendingApproval() {
    this.transitionTo(PurchaseOrderStatus.PENDING);
  }

  approve() {
    this.transitionTo(PurchaseOrderStatus.APPROVED);
  }

  reject() {
    this.transitionTo(PurchaseOrderStatus.REJECTED);
  }

  cancel() {
    this.transitionTo(PurchaseOrderStatus.CANCELLED);
  }

  sent() {
    // This codebase does not have a separate SENT status in enum.
    // We map SENT -> APPROVED (idempotent and safe).
    if (this.props.status === PurchaseOrderStatus.APPROVED) return;
    // If caller tries SENT from a non-APPROVED state, we validate transitionTo.
    // We allow from PENDING/APPROVED via standard transition rules.
    this.transitionTo(PurchaseOrderStatus.APPROVED);
  }

  complete() {
    this.assertNotCancelledOrCompleted();

    // Duplicate completion prevention: idempotent if already completed.
    if (this.props.status === PurchaseOrderStatus.COMPLETED) return;

    if (this.props.status !== PurchaseOrderStatus.RECEIVED) {
      throw new Error('Only RECEIVED purchase orders can be completed');
    }

    const allReceived = this.props.items.every(
      (i) => i.receivedQuantity >= i.quantity,
    );

    if (!allReceived) {
      throw new Error('Cannot complete PO until all items are fully received');
    }

    this.transitionTo(PurchaseOrderStatus.COMPLETED);
  }

  // 2) Partial receiving + idempotent incremental receiving
  /**
   * Apply incremental receives.
   * Receipts are cumulative receivedQuantity per item AFTER this operation.
   * Returns inventory movement specs for ONLY newly received quantities.
   */
  receive(receipts: Receipt[]): ReceivingMovementSpec[] {
    this.assertNotCancelledOrCompleted();

    const allowed =
      this.props.status === PurchaseOrderStatus.APPROVED ||
      this.props.status === PurchaseOrderStatus.PARTIALLY_RECEIVED;

    if (!allowed) {
      throw new Error(
        `Cannot receive purchase order while in ${this.props.status}`,
      );
    }

    if (!receipts || receipts.length === 0) {
      throw new Error('At least one receipt item is required');
    }

    // Map receipts by inventoryItemId for validation.
    const receiptByItem = new Map<string, number>();
    for (const r of receipts) {
      if (!r.inventoryItemId.trim()) {
        throw new Error('inventoryItemId must not be empty');
      }
      if (!Number.isFinite(r.receivedQuantity) || r.receivedQuantity < 0) {
        throw new Error('receivedQuantity must be >= 0');
      }
      const existing = receiptByItem.get(r.inventoryItemId);
      if (existing !== undefined) {
        throw new Error('Duplicate receipt inventoryItemId');
      }
      receiptByItem.set(r.inventoryItemId, r.receivedQuantity);
    }

    // Validate receipts only for items in PO.
    for (const [inventoryItemId] of receiptByItem) {
      const exists = this.props.items.some(
        (i) => i.inventoryItemId === inventoryItemId,
      );
      if (!exists) {
        throw new Error('Receipt inventory item does not belong to PO');
      }
    }

    // Apply cumulative received quantities.
    const movements: ReceivingMovementSpec[] = [];

    const nextItems = this.props.items.map((item) => {
      const nextReceived = receiptByItem.get(item.inventoryItemId);
      if (nextReceived === undefined) {
        return item;
      }

      if (nextReceived < item.receivedQuantity) {
        throw new Error('Cannot decrease already received quantity');
      }

      if (nextReceived > item.quantity) {
        throw new Error('Cannot receive more than ordered quantity');
      }

      const delta = nextReceived - item.receivedQuantity;
      if (delta > 0) {
        movements.push({
          inventoryItemId: item.inventoryItemId,
          deltaQuantity: delta,
        });
      }

      return {
        ...item,
        receivedQuantity: nextReceived,
      };
    });

    // Remaining quantities determine next status.
    const allReceived = nextItems.every(
      (i) => i.receivedQuantity >= i.quantity,
    );
    const anyReceived = nextItems.some((i) => i.receivedQuantity > 0);

    if (!anyReceived) {
      // Idempotency: if receipts did not advance quantities.
      // Keep current status.
      return [];
    }

    const nextStatus = allReceived
      ? PurchaseOrderStatus.RECEIVED
      : PurchaseOrderStatus.PARTIALLY_RECEIVED;

    // Enforce status transition validation.
    if (nextStatus === PurchaseOrderStatus.RECEIVED) {
      // APPROVED -> RECEIVED or PARTIALLY_RECEIVED -> RECEIVED
      this.assertAllowedTransition(PurchaseOrderStatus.RECEIVED);
    } else {
      // APPROVED -> PARTIALLY_RECEIVED or PARTIALLY_RECEIVED -> PARTIALLY_RECEIVED (idempotent)
      if (this.props.status === PurchaseOrderStatus.PARTIALLY_RECEIVED) {
        // idempotent: keep
      } else {
        this.assertAllowedTransition(PurchaseOrderStatus.PARTIALLY_RECEIVED);
      }
    }

    this.props = {
      ...this.props,
      items: nextItems,
      status: nextStatus,
      receivedAt:
        nextStatus === PurchaseOrderStatus.RECEIVED
          ? new Date()
          : this.props.receivedAt,
      updatedAt: new Date(),
    };

    return movements;
  }
}
