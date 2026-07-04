import { AggregateRoot } from '../../../core/domain/aggregate-root';
import { OrderStatus, Prisma } from '@prisma/client';

export type SalesOrderWithItems = Prisma.SalesOrderGetPayload<{
  include: {
    SalesOrderItem: {
      include: { Product: true };
    };
  };
}>;

export type OrderItemDetails = {
  productId: string;
  quantity: number;
  price: number;
  subtotal: number;
};

export class OrderAggregate extends AggregateRoot {
  private constructor(private readonly order: SalesOrderWithItems) {
    super();
  }

  static fromPersistence(order: SalesOrderWithItems) {
    return new OrderAggregate(order);
  }

  get id(): string {
    return this.order.id;
  }

  get tenantId(): string {
    return this.order.tenantId;
  }

  get outletId(): string | null {
    return this.order.outletId;
  }

  get status(): OrderStatus {
    return this.order.status;
  }

  get orderNumber(): string {
    return this.order.orderNumber;
  }

  get totalAmount(): number {
    return this.order.totalAmount;
  }

  get items(): OrderItemDetails[] {
    return this.order.SalesOrderItem.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      price: item.price,
      subtotal: item.subtotal,
    }));
  }

  get persistedOrder(): SalesOrderWithItems {
    return this.order;
  }

  markPaid(): void {
    if (this.order.status === OrderStatus.CANCELLED) {
      throw new Error('Cannot mark a cancelled order as paid');
    }

    if (this.order.status === OrderStatus.COMPLETED) {
      throw new Error('Cannot mark a completed order as paid');
    }

    this.order.status = OrderStatus.PAID;
  }

  complete(): void {
    if (this.order.status === OrderStatus.CANCELLED) {
      throw new Error('Cannot complete a cancelled order');
    }

    if (this.order.status !== OrderStatus.PAID) {
      throw new Error('Only paid orders can be completed');
    }

    this.order.status = OrderStatus.COMPLETED;
  }

  cancel(): void {
    if (this.order.status === OrderStatus.COMPLETED) {
      throw new Error('Cannot cancel a completed order');
    }

    if (this.order.status === OrderStatus.CANCELLED) {
      return;
    }

    this.order.status = OrderStatus.CANCELLED;
  }

  toObject(): SalesOrderWithItems {
    return this.order;
  }
}
