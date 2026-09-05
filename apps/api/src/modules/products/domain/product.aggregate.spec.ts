import { Money } from '../../../core/domain/value-objects/money';
import { DOMAIN_EVENTS } from '../../../core/events/domain-events';
import { ProductAggregate } from './product.aggregate';

describe('ProductAggregate', () => {
  const product = () =>
    ProductAggregate.create({
      id: 'product-a',
      tenantId: 'tenant-a',
      name: 'Coffee',
      sku: 'COFFEE-1',
      price: Money.fromInteger(250),
      isActive: true,
      outletId: 'outlet-a',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

  it('rejects empty names and negative prices', () => {
    expect(() => product().updateDetails({ name: ' ' })).toThrow(
      'Product name must not be empty',
    );

    expect(() => Money.fromInteger(-1)).toThrow(
      'Money amount must be a non-negative integer',
    );
    expect(() =>
      product().updateDetails({ price: { value: -1 } as Money }),
    ).toThrow('Product price must be a non-negative integer');
  });

  it('emits a tenant-scoped update event for valid changes', () => {
    const aggregate = product();

    aggregate.updateDetails({ name: 'Iced Coffee' });

    expect(aggregate.name).toBe('Iced Coffee');
    expect(aggregate.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: DOMAIN_EVENTS.PRODUCT_UPDATED,
        payload: {
          productId: 'product-a',
          tenantId: 'tenant-a',
          outletId: 'outlet-a',
        },
      }),
    ]);
  });

  it('deactivates once and treats repeated deactivation as idempotent', () => {
    const aggregate = product();

    aggregate.deactivate();
    aggregate.deactivate();

    expect(aggregate.isActive).toBe(false);
    expect(aggregate.pullDomainEvents()).toHaveLength(1);
  });
});
