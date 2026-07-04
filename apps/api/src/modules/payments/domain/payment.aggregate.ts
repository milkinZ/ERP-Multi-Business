import { AggregateRoot } from '../../../core/domain/aggregate-root';
import { PaymentStatus } from '@prisma/client';

export type PaymentProps = {
  id: string;
  tenantId: string;
  orderId: string;
  amount: number;
  method: string;
  status: PaymentStatus;
  paidAt: Date;
  createdAt: Date;
};

export class PaymentAggregate extends AggregateRoot {
  private constructor(private props: PaymentProps) {
    super();
  }

  static create(props: PaymentProps) {
    if (props.amount <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }

    if (!props.orderId.trim()) {
      throw new Error('Payment must reference an order');
    }

    if (!props.method.trim()) {
      throw new Error('Payment method must not be empty');
    }

    return new PaymentAggregate(props);
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get orderId(): string {
    return this.props.orderId;
  }

  get amount(): number {
    return this.props.amount;
  }

  get method(): string {
    return this.props.method;
  }

  get status(): PaymentStatus {
    return this.props.status;
  }

  get paidAt(): Date {
    return this.props.paidAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  toPersistence() {
    return {
      id: this.id,
      tenantId: this.tenantId,
      orderId: this.orderId,
      amount: this.amount,
      method: this.method,
      status: this.status,
      paidAt: this.paidAt,
      createdAt: this.createdAt,
    };
  }
}
