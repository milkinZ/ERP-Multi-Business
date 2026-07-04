export type IngredientProps = {
  id: string;
  name: string;
  unit: string;
  tenantId: string;
  inventoryItemId: string;
  createdAt: Date;
  //   updatedAt: Date;
};

export class IngredientAggregate {
  constructor(private props: IngredientProps) {}

  static create(props: IngredientProps) {
    if (!props.name || !props.name.trim()) {
      throw new Error('Ingredient name is required');
    }

    if (!props.unit || !props.unit.trim()) {
      throw new Error('Ingredient unit is required');
    }

    return new IngredientAggregate(props);
  }

  static fromPersistence(payload: {
    id: string;
    name: string;
    unit: string;
    tenantId: string;
    inventoryItemId: string;
    createdAt: Date;
    // updatedAt: Date;
  }) {
    return new IngredientAggregate({
      id: payload.id,
      name: payload.name,
      unit: payload.unit,
      tenantId: payload.tenantId,
      inventoryItemId: payload.inventoryItemId,
      createdAt: payload.createdAt,
      //   updatedAt: payload.updatedAt,
    });
  }

  get id() {
    return this.props.id;
  }

  get name() {
    return this.props.name;
  }

  get unit() {
    return this.props.unit;
  }

  get inventoryItemId() {
    return this.props.inventoryItemId;
  }

  get tenantId() {
    return this.props.tenantId;
  }

  get persisted() {
    return this.props;
  }
}
