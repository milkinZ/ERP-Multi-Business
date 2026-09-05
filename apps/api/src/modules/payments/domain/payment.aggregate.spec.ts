import { PaymentStatus } from '@prisma/client';

import { PaymentAggregate } from './payment.aggregate';

describe('PaymentAggregate', () => {
  const base = {
    id: 'payment-a',
    tenantId: 'tenant-a',
    orderId: 'order-a',
    amount: 1000,
    method: 'CASH',
    status: PaymentStatus.PENDING,
    paidAt: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  it('accepts a valid payment and preserves persistence fields', () => {
    const aggregate = PaymentAggregate.create(base);

    expect(aggregate.toPersistence()).toEqual(base);
  });

  it('rejects non-positive, unreferenced, and methodless payments', () => {
    expect(() => PaymentAggregate.create({ ...base, amount: 0 })).toThrow(
      'Payment amount must be greater than zero',
    );
    expect(() => PaymentAggregate.create({ ...base, orderId: ' ' })).toThrow(
      'Payment must reference an order',
    );
    expect(() => PaymentAggregate.create({ ...base, method: ' ' })).toThrow(
      'Payment method must not be empty',
    );
  });
});
