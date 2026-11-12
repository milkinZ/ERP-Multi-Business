import { AggregateRoot } from '../../../core/domain/aggregate-root';

export type RecipeItemProps = {
  inventoryItemId: string;
  quantity: number;
  unit?: string;
};

export type RecipeProps = {
  id: string;
  tenantId: string;
  productId: string;
  items: RecipeItemProps[];
  createdAt: Date;
};

export class RecipeAggregate extends AggregateRoot {
  private constructor(private props: RecipeProps) {
    super();
  }

  static create(props: RecipeProps) {
    if (!props.productId.trim()) {
      throw new Error('Recipe product id must not be empty');
    }

    if (!props.items || props.items.length === 0) {
      throw new Error('Recipe must contain at least one inventory item');
    }

    const duplicateIngredientIds = new Set(
      props.items.map((item) => item.inventoryItemId),
    );
    if (duplicateIngredientIds.size !== props.items.length) {
      throw new Error('Duplicate inventory items detected');
    }

    props.items.forEach((item) => {
      if (!item.inventoryItemId.trim()) {
        throw new Error('Inventory item id must not be empty');
      }

      if (
        !Number.isFinite(item.quantity) ||
        item.quantity <= 0 ||
        Math.abs(
          item.quantity * 1_000_000 - Math.round(item.quantity * 1_000_000),
        ) > 0.000001
      ) {
        throw new Error(
          'Inventory item quantity must be positive with at most six decimal places',
        );
      }

      if (item.unit !== undefined && !item.unit.trim()) {
        throw new Error('Recipe item unit must not be empty');
      }
    });

    return new RecipeAggregate(props);
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get productId(): string {
    return this.props.productId;
  }

  get items(): RecipeItemProps[] {
    return this.props.items;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
