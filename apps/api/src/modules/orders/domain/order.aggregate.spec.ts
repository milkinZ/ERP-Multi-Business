import { OrderStatus } from '@prisma/client';

import { OrderAggregate, SalesOrderWithItems } from './order.aggregate';

function order(status: OrderStatus): SalesOrderWithItems {
  return {
    id: 'order-a',
    orderNumber: 'ORD-A',
    status,
    totalAmount: 100,
    tenantId: 'tenant-a',
    outletId: 'outlet-a',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    SalesOrderItem: [],
  };
}

describe('OrderAggregate', () => {
  it('transitions a pending order to paid and then completed', () => {
    const aggregate = OrderAggregate.fromPersistence(
      order(OrderStatus.PENDING),
    );

    aggregate.markPaid();
    expect(aggregate.status).toBe(OrderStatus.PAID);
    aggregate.complete();
    expect(aggregate.status).toBe(OrderStatus.COMPLETED);
  });

  it('rejects completion before payment and payment after completion/cancellation', () => {
    expect(() =>
      OrderAggregate.fromPersistence(order(OrderStatus.PENDING)).complete(),
    ).toThrow('Only paid orders can be completed');
    expect(() =>
      OrderAggregate.fromPersistence(order(OrderStatus.CANCELLED)).markPaid(),
    ).toThrow('Cannot mark a cancelled order as paid');
    expect(() =>
      OrderAggregate.fromPersistence(order(OrderStatus.COMPLETED)).markPaid(),
    ).toThrow('Cannot mark a completed order as paid');
  });

  it('makes cancellation idempotent but never allows cancelling completed orders', () => {
    const aggregate = OrderAggregate.fromPersistence(
      order(OrderStatus.PENDING),
    );

    aggregate.cancel();
    aggregate.cancel();
    expect(aggregate.status).toBe(OrderStatus.CANCELLED);
    expect(() =>
      OrderAggregate.fromPersistence(order(OrderStatus.COMPLETED)).cancel(),
    ).toThrow('Cannot cancel a completed order');
  });
});
