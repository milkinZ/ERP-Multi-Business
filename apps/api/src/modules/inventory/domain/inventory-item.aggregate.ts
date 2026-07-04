import { AggregateRoot } from '../../../core/domain/aggregate-root';
import { InventoryItemType } from '@prisma/client';

export type InventoryItemProps = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description?: string | null;
  unit?: string | null;
  type: InventoryItemType;
  isActive: boolean;
  createdAt: Date;
};

export class InventoryItemAggregate extends AggregateRoot {
  constructor(private props: InventoryItemProps) {
    super();
  }

  static create(props: InventoryItemProps) {
    if (!props.code.trim()) {
      throw new Error('Inventory item code must not be empty');
    }

    if (!props.name.trim()) {
      throw new Error('Inventory item name must not be empty');
    }

    return new InventoryItemAggregate(props);
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get code(): string {
    return this.props.code;
  }

  get name(): string {
    return this.props.name;
  }

  get description(): string | null | undefined {
    return this.props.description;
  }

  get unit(): string | null | undefined {
    return this.props.unit;
  }

  get type(): InventoryItemType {
    return this.props.type;
  }

  get isActive(): boolean {
    return this.props.isActive;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  rename(name: string) {
    if (!name.trim()) {
      throw new Error('Inventory item name must not be empty');
    }

    this.props = { ...this.props, name };
  }

  deactivate() {
    if (!this.props.isActive) {
      return;
    }

    this.props = { ...this.props, isActive: false };
  }

  toPersistence() {
    return {
      id: this.id,
      tenantId: this.tenantId,
      code: this.code,
      name: this.name,
      description: this.description,
      unit: this.unit,
      type: this.type,
      isActive: this.isActive,
      createdAt: this.createdAt,
    };
  }
}
