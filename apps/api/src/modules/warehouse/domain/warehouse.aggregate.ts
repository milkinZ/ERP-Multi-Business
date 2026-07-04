import { AggregateRoot } from '../../../core/domain/aggregate-root';

export type WarehouseProps = {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  outletId?: string | null;
  createdAt: Date;
};

export class WarehouseAggregate extends AggregateRoot {
  constructor(private props: WarehouseProps) {
    super();
  }

  static create(props: WarehouseProps) {
    if (!props.name.trim()) {
      throw new Error('Warehouse name must not be empty');
    }

    if (!props.code.trim()) {
      throw new Error('Warehouse code must not be empty');
    }

    return new WarehouseAggregate(props);
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

  get code(): string {
    return this.props.code;
  }

  get outletId(): string | null | undefined {
    return this.props.outletId;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  rename(name: string) {
    if (!name.trim()) {
      throw new Error('Warehouse name must not be empty');
    }

    this.props = { ...this.props, name };
  }

  changeCode(code: string) {
    if (!code.trim()) {
      throw new Error('Warehouse code must not be empty');
    }

    this.props = { ...this.props, code };
  }

  toPersistence() {
    return {
      id: this.id,
      tenantId: this.tenantId,
      name: this.name,
      code: this.code,
      outletId: this.outletId,
      createdAt: this.createdAt,
    };
  }
}
