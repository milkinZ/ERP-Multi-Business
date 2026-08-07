import { AggregateRoot } from '../../../core/domain/aggregate-root';
import {
  KitchenStatus,
  KITCHEN_VALID_TRANSITIONS,
} from './kitchen-status.enum';

export type KitchenTicketItem = {
  productId: string;
  productName: string;
  quantity: number;
};

export type KitchenTicketProps = {
  id: string;
  ticketNumber: string;
  salesOrderId: string;
  tenantId: string;
  outletId: string | null;
  items: KitchenTicketItem[];
  status: KitchenStatus;
  priority: number;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export class KitchenTicketAggregate extends AggregateRoot {
  private constructor(private props: KitchenTicketProps) {
    super();
  }

  static create(
    props: Omit<
      KitchenTicketProps,
      'status' | 'priority' | 'createdAt' | 'updatedAt'
    >,
  ) {
    return new KitchenTicketAggregate({
      ...props,
      status: KitchenStatus.NEW,
      priority: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  static fromPersistence(props: KitchenTicketProps) {
    return new KitchenTicketAggregate(props);
  }

  get id(): string {
    return this.props.id;
  }
  get ticketNumber(): string {
    return this.props.ticketNumber;
  }
  get salesOrderId(): string {
    return this.props.salesOrderId;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get outletId(): string | null {
    return this.props.outletId;
  }
  get status(): KitchenStatus {
    return this.props.status;
  }
  get items(): KitchenTicketItem[] {
    return [...this.props.items];
  }
  get priority(): number {
    return this.props.priority;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  private transitionTo(nextStatus: KitchenStatus) {
    const allowed = KITCHEN_VALID_TRANSITIONS[this.props.status];
    if (!allowed.includes(nextStatus)) {
      throw new Error(
        'Invalid kitchen ticket transition from ' +
          this.props.status +
          ' to ' +
          nextStatus,
      );
    }
    this.props.status = nextStatus;
    this.props.updatedAt = new Date();
  }

  enqueue(): void {
    this.transitionTo(KitchenStatus.QUEUED);
  }
  startCooking(): void {
    this.transitionTo(KitchenStatus.COOKING);
  }

  markReady(): void {
    if (this.props.status !== KitchenStatus.COOKING) {
      throw new Error('Only COOKING tickets can be marked READY');
    }
    this.transitionTo(KitchenStatus.READY);
  }

  markServed(): void {
    if (this.props.status !== KitchenStatus.READY) {
      throw new Error('Only READY tickets can be marked SERVED');
    }
    this.transitionTo(KitchenStatus.SERVED);
  }

  cancel(): void {
    this.transitionTo(KitchenStatus.CANCELLED);
  }
  recall(): void {
    this.transitionTo(KitchenStatus.RECALLED);
  }
  setPriority(priority: number): void {
    this.props.priority = Math.max(0, priority);
  }
  toObject(): KitchenTicketProps {
    return { ...this.props };
  }
}
