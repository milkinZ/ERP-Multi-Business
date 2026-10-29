import { AggregateRoot } from '../../../core/domain/aggregate-root';
import { DOMAIN_EVENTS } from '../../../core/events/domain-events';

export enum SubscriptionStatus {
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  SUSPENDED = 'SUSPENDED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum PlanType {
  FREE = 'FREE',
  STARTER = 'STARTER',
  BUSINESS = 'BUSINESS',
  ENTERPRISE = 'ENTERPRISE',
}

export type SubscriptionProps = {
  id: string;
  tenantId: string;
  planId: string;
  pendingPlanId?: string | null;
  status: SubscriptionStatus;
  startedAt: Date;
  endedAt: Date | null;
  deletedAt: Date | null;
};

export type PlanProps = {
  id: string;
  type: PlanType;
  name: string;
  priceCents: number;
};

/**
 * Subscription Aggregate Root
 *
 * Owns all subscription lifecycle business rules.
 * No anemic domain model.
 */
export class SubscriptionAggregate extends AggregateRoot {
  private constructor(
    private readonly props: SubscriptionProps,
    private plan: PlanProps,
    private pendingPlan: PlanProps | null = null,
  ) {
    super();
  }

  static create(
    props: SubscriptionProps,
    plan: PlanProps,
  ): SubscriptionAggregate {
    const aggregate = new SubscriptionAggregate(props, plan);

    if (props.status === SubscriptionStatus.ACTIVE) {
      aggregate.addDomainEvent({
        type: DOMAIN_EVENTS.SUBSCRIPTION_CREATED,
        payload: {
          subscriptionId: props.id,
          tenantId: props.tenantId,
          planType: plan.type,
        },
      });

      aggregate.addDomainEvent({
        type: DOMAIN_EVENTS.SUBSCRIPTION_ACTIVATED,
        payload: {
          subscriptionId: props.id,
          tenantId: props.tenantId,
          planType: plan.type,
        },
      });
    }

    return aggregate;
  }

  static reconstitute(
    props: SubscriptionProps,
    plan: PlanProps,
    pendingPlan: PlanProps | null = null,
  ): SubscriptionAggregate {
    return new SubscriptionAggregate(props, plan, pendingPlan);
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get planId(): string {
    return this.props.planId;
  }

  get pendingPlanId(): string | null {
    return this.props.pendingPlanId ?? null;
  }

  get status(): SubscriptionStatus {
    return this.props.status;
  }

  get planType(): PlanType {
    return this.plan.type;
  }

  get planPriceCents(): number {
    return this.plan.priceCents;
  }

  get startedAt(): Date {
    return this.props.startedAt;
  }

  get endedAt(): Date | null {
    return this.props.endedAt;
  }

  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }

  isActive(): boolean {
    return (
      this.props.status === SubscriptionStatus.ACTIVE &&
      !this.props.deletedAt &&
      !this.isExpired()
    );
  }

  isExpired(): boolean {
    return !!this.props.endedAt && new Date() > this.props.endedAt;
  }

  canActivate(): boolean {
    return (
      (this.props.status === SubscriptionStatus.TRIAL ||
        this.props.status === SubscriptionStatus.PAST_DUE ||
        this.props.status === SubscriptionStatus.SUSPENDED) &&
      !this.props.deletedAt &&
      !this.isExpired()
    );
  }

  activate(): void {
    if (this.props.status === SubscriptionStatus.ACTIVE) {
      // Idempotent — already active
      return;
    }

    if (this.props.status === SubscriptionStatus.CANCELLED) {
      throw new Error('Cannot activate a cancelled subscription');
    }

    if (this.props.status === SubscriptionStatus.EXPIRED) {
      throw new Error('Cannot activate an expired subscription');
    }
    if (this.props.deletedAt || this.isExpired()) {
      throw new Error('Cannot activate an expired subscription');
    }

    this.props.status = SubscriptionStatus.ACTIVE;
    this.addDomainEvent({
      type: DOMAIN_EVENTS.SUBSCRIPTION_ACTIVATED,
      payload: {
        subscriptionId: this.props.id,
        tenantId: this.props.tenantId,
        planType: this.plan.type,
      },
    });
  }

  renew(billingPeriodStart: Date, billingPeriodEnd: Date): void {
    if (this.props.status === SubscriptionStatus.CANCELLED) {
      throw new Error('Cannot renew a cancelled subscription');
    }

    if (this.props.deletedAt) {
      throw new Error('Cannot renew a deleted subscription');
    }

    if (billingPeriodStart >= billingPeriodEnd) {
      throw new Error('Billing period start must be before its end');
    }

    if (
      this.props.status === SubscriptionStatus.ACTIVE &&
      this.props.endedAt &&
      this.props.endedAt >= billingPeriodEnd
    ) {
      return;
    }

    if (this.pendingPlanId && !this.pendingPlan) {
      throw new Error(
        `Subscription ${this.props.id} has a pending plan ID without its plan`,
      );
    }

    if (this.pendingPlan) {
      const oldPlan = this.plan;
      this.plan = this.pendingPlan;
      this.props.planId = this.pendingPlan.id;
      this.pendingPlan = null;
      this.props.pendingPlanId = null;
      this.addDomainEvent({
        type: DOMAIN_EVENTS.SUBSCRIPTION_PLAN_CHANGED,
        payload: {
          subscriptionId: this.props.id,
          tenantId: this.props.tenantId,
          oldPlanType: oldPlan.type,
          newPlanType: this.plan.type,
        },
      });
    }

    this.props.status = SubscriptionStatus.ACTIVE;
    this.props.endedAt = billingPeriodEnd;

    this.addDomainEvent({
      type: DOMAIN_EVENTS.SUBSCRIPTION_RENEWED,
      payload: {
        subscriptionId: this.props.id,
        tenantId: this.props.tenantId,
        planType: this.plan.type,
        billingPeriodStart: billingPeriodStart.toISOString(),
        billingPeriodEnd: billingPeriodEnd.toISOString(),
      },
    });
  }

  cancel(reason?: string): void {
    if (this.props.status === SubscriptionStatus.CANCELLED) {
      // Idempotent
      return;
    }

    if (this.props.status === SubscriptionStatus.EXPIRED) {
      throw new Error('Cannot cancel an already expired subscription');
    }

    this.props.status = SubscriptionStatus.CANCELLED;

    this.addDomainEvent({
      type: DOMAIN_EVENTS.SUBSCRIPTION_CANCELLED,
      payload: {
        subscriptionId: this.props.id,
        tenantId: this.props.tenantId,
        reason,
      },
    });
  }

  expire(): void {
    if (this.props.status === SubscriptionStatus.EXPIRED) {
      // Idempotent
      return;
    }

    this.props.status = SubscriptionStatus.EXPIRED;

    this.addDomainEvent({
      type: DOMAIN_EVENTS.SUBSCRIPTION_EXPIRED,
      payload: {
        subscriptionId: this.props.id,
        tenantId: this.props.tenantId,
      },
    });
  }

  suspend(reason?: string): void {
    if (this.props.status === SubscriptionStatus.SUSPENDED) {
      return;
    }

    if (this.props.status === SubscriptionStatus.CANCELLED) {
      throw new Error('Cannot suspend a cancelled subscription');
    }

    if (this.props.status === SubscriptionStatus.EXPIRED) {
      throw new Error('Cannot suspend an expired subscription');
    }

    this.props.status = SubscriptionStatus.SUSPENDED;

    this.addDomainEvent({
      type: DOMAIN_EVENTS.SUBSCRIPTION_SUSPENDED,
      payload: {
        subscriptionId: this.props.id,
        tenantId: this.props.tenantId,
        reason,
      },
    });
  }

  schedulePlanChange(newPlan: PlanProps): void {
    const previousPendingPlanId = this.pendingPlanId;
    const nextPendingPlan = newPlan.id === this.plan.id ? null : newPlan;
    const nextPendingPlanId = nextPendingPlan?.id ?? null;

    if (previousPendingPlanId === nextPendingPlanId) {
      return;
    }

    this.pendingPlan = nextPendingPlan;
    this.props.pendingPlanId = nextPendingPlanId;

    this.addDomainEvent({
      type: DOMAIN_EVENTS.SUBSCRIPTION_PLAN_CHANGE_SCHEDULED,
      payload: {
        subscriptionId: this.props.id,
        tenantId: this.props.tenantId,
        currentPlanId: this.props.planId,
        previousPendingPlanId,
        pendingPlanId: nextPendingPlanId,
        effectiveAt: 'NEXT_RENEWAL',
      },
    });
  }

  markPastDue(dueAmountCents: number): void {
    this.props.status = SubscriptionStatus.PAST_DUE;

    this.addDomainEvent({
      type: DOMAIN_EVENTS.SUBSCRIPTION_PAST_DUE,
      payload: {
        subscriptionId: this.props.id,
        tenantId: this.props.tenantId,
        dueAmountCents,
      },
    });
  }

  toJSON() {
    return {
      id: this.props.id,
      tenantId: this.props.tenantId,
      planId: this.props.planId,
      pendingPlanId: this.pendingPlanId,
      pendingPlanEffectiveAt: this.pendingPlanId ? 'NEXT_RENEWAL' : null,
      status: this.props.status,
      planType: this.plan.type,
      priceCents: this.plan.priceCents,
      startedAt: this.props.startedAt,
      endedAt: this.props.endedAt,
    };
  }
}
