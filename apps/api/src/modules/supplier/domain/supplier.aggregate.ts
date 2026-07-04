import { AggregateRoot } from '../../../core/domain/aggregate-root';

export type SupplierProps = {
  id: string;
  tenantId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  createdAt: Date;
};

export class SupplierAggregate extends AggregateRoot {
  private constructor(private props: SupplierProps) {
    super();
  }

  static create(props: SupplierProps) {
    if (!props.name.trim()) {
      throw new Error('Supplier name must not be empty');
    }

    return new SupplierAggregate(props);
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

  get phone(): string | null | undefined {
    return this.props.phone;
  }

  get email(): string | null | undefined {
    return this.props.email;
  }

  get address(): string | null | undefined {
    return this.props.address;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  updateDetails(data: {
    name?: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  }) {
    if (data.name !== undefined && !data.name.trim()) {
      throw new Error('Supplier name must not be empty');
    }

    this.props = {
      ...this.props,
      ...data,
      phone: data.phone === null ? null : (data.phone ?? this.props.phone),
      email: data.email === null ? null : (data.email ?? this.props.email),
      address:
        data.address === null ? null : (data.address ?? this.props.address),
    };
  }

  toPersistence() {
    return {
      id: this.id,
      tenantId: this.tenantId,
      name: this.name,
      phone: this.phone,
      email: this.email,
      address: this.address,
      createdAt: this.createdAt,
    };
  }
}
