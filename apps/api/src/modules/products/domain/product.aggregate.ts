import { AggregateRoot } from '../../../core/domain/aggregate-root';
import { DOMAIN_EVENTS } from '../../../core/events/domain-events';
import { Money } from '../../../core/domain/value-objects/money';
import { SKU } from '../../../core/domain/value-objects/sku';

export type ProductProps = {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  sku?: string | null;
  price: Money;
  inventoryItemId?: string | null;
  isActive: boolean;
  outletId?: string | null;
  createdAt: Date;
};

export class ProductAggregate extends AggregateRoot {
  private constructor(private props: ProductProps) {
    super();
  }

  static create(props: ProductProps) {
    const price = Money.fromInteger(props.price.value);
    const sku = props.sku ? SKU.create(props.sku) : undefined;

    return new ProductAggregate({
      ...props,
      price,
      sku: sku?.code,
    });
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get name(): string {
    return this.props.name;
  }

  get description(): string | null | undefined {
    return this.props.description;
  }

  get sku(): string | null | undefined {
    return this.props.sku;
  }

  get price(): Money {
    return this.props.price;
  }

  get inventoryItemId(): string | null | undefined {
    return this.props.inventoryItemId;
  }

  get isActive(): boolean {
    return this.props.isActive;
  }

  get outletId(): string | null | undefined {
    return this.props.outletId;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  updateDetails(data: {
    name?: string;
    description?: string | null;
    sku?: string | null;
    price?: Money;
  }) {
    if (data.name !== undefined && !data.name.trim()) {
      throw new Error('Product name must not be empty');
    }

    if (data.sku !== undefined && data.sku !== null) {
      SKU.create(data.sku);
    }

    if (data.price !== undefined && data.price.value < 0) {
      throw new Error('Product price must be a non-negative integer');
    }

    this.props = {
      ...this.props,
      ...data,
      sku: data.sku === null ? null : (data.sku ?? this.props.sku),
      price: data.price ?? this.props.price,
    };

    this.addDomainEvent({
      type: DOMAIN_EVENTS.PRODUCT_UPDATED,
      payload: {
        productId: this.id,
        tenantId: this.tenantId,
        outletId: this.outletId,
      },
    });
  }

  deactivate() {
    if (!this.props.isActive) {
      return;
    }

    this.props = { ...this.props, isActive: false };
    this.addDomainEvent({
      type: DOMAIN_EVENTS.PRODUCT_DELETED as typeof DOMAIN_EVENTS.PRODUCT_DELETED,
      payload: {
        productId: this.id,
        tenantId: this.tenantId,
        outletId: this.outletId,
      },
    });
  }

  toPersistence() {
    return {
      id: this.id,
      tenantId: this.tenantId,
      name: this.name,
      description: this.description,
      sku: this.sku,
      price: this.price.toNumber(),
      inventoryItemId: this.inventoryItemId,
      isActive: this.isActive,
      outletId: this.outletId,
      createdAt: this.createdAt,
    };
  }
}
