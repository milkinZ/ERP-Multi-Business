import { AggregateRoot } from '../../../core/domain/aggregate-root';

export type RecipeItemProps = {
  ingredientId: string;
  quantity: number;
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
      throw new Error('Recipe must contain at least one ingredient');
    }

    const duplicateIngredientIds = new Set(
      props.items.map((item) => item.ingredientId),
    );
    if (duplicateIngredientIds.size !== props.items.length) {
      throw new Error('Duplicate ingredients detected');
    }

    props.items.forEach((item) => {
      if (!item.ingredientId.trim()) {
        throw new Error('Ingredient id must not be empty');
      }

      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new Error('Ingredient quantity must be a positive integer');
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
