import { AggregateRoot } from '../../../core/domain/aggregate-root';

export enum ReservationStatus {
  PENDING = 'PENDING',
  RESERVED = 'RESERVED',
  COMMITTED = 'COMMITTED',
  RELEASED = 'RELEASED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export type ReservationProps = {
  orderId: string;
  tenantId: string;
  outletId?: string | null;
  status: ReservationStatus;
  reservedAt: Date;
};

export class ReservationAggregate extends AggregateRoot {
  constructor(private props: ReservationProps) {
    super();
  }

  static create(orderId: string, tenantId: string, outletId?: string | null) {
    return new ReservationAggregate({
      orderId,
      tenantId,
      outletId: outletId ?? null,
      status: ReservationStatus.PENDING,
      reservedAt: new Date(),
    });
  }

  static fromPersistence(payload: ReservationProps) {
    return new ReservationAggregate(payload);
  }

  get orderId() {
    return this.props.orderId;
  }

  get tenantId() {
    return this.props.tenantId;
  }

  get outletId() {
    return this.props.outletId;
  }

  get status() {
    return this.props.status;
  }

  get reservedAt() {
    return this.props.reservedAt;
  }

  reserve() {
    if (this.props.status !== ReservationStatus.PENDING) {
      throw new Error('Reservation cannot be reserved from current state');
    }

    this.props.status = ReservationStatus.RESERVED;
    return this;
  }

  commit() {
    if (this.props.status !== ReservationStatus.RESERVED) {
      throw new Error('Only reserved reservations can be committed');
    }

    this.props.status = ReservationStatus.COMMITTED;
    return this;
  }

  release() {
    if (this.props.status !== ReservationStatus.RESERVED) {
      throw new Error('Only reserved reservations can be released');
    }

    this.props.status = ReservationStatus.RELEASED;
    return this;
  }

  expire() {
    if (this.props.status !== ReservationStatus.RESERVED) {
      throw new Error('Only reserved reservations can expire');
    }

    this.props.status = ReservationStatus.EXPIRED;
    return this;
  }

  cancel() {
    if (this.props.status !== ReservationStatus.RESERVED) {
      throw new Error('Only reserved reservations can be cancelled');
    }

    this.props.status = ReservationStatus.CANCELLED;
    return this;
  }

  toObject() {
    return { ...this.props };
  }
}
