import { AggregateRoot } from '../../../core/domain/aggregate-root';
import { DOMAIN_EVENTS } from '../../../core/events/domain-events';

export enum SuperAdminTargetStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DEACTIVATED = 'DEACTIVATED',
}

export type SuperAdminTargetTenantProps = {
  tenantId: string;
  name?: string | null;
  status: SuperAdminTargetStatus;
  deletedAt?: Date | null;
};

export type SuperAdminPlanProps = {
  id: string;
  type: string;
  name: string;
  priceCents: number;
};

/**
 * Super Admin Aggregate Root
 *
 * Owns the decision-making for global (cross-tenant) super admin actions.
 * It does NOT perform persistence or business-module operations — it only
 * validates the legality/idempotency of a super admin action and emits the
 * corresponding super admin domain events so Audit Logs and Realtime work
 * automatically via the Outbox -> DomainEventBus pipeline.
 */
export class SuperAdminAggregate extends AggregateRoot {
  private readonly actionedByUserId: string;
  private readonly actorTenantIdValue: string;
  private readonly targetState: SuperAdminTargetTenantProps;

  private constructor(
    actionedByUserId: string,
    actorTenantId: string,
    target: SuperAdminTargetTenantProps,
  ) {
    super();
    this.actionedByUserId = actionedByUserId;
    this.actorTenantIdValue = actorTenantId;
    this.targetState = target;
  }

  static forTarget(
    actionedByUserId: string,
    actorTenantId: string,
    target: SuperAdminTargetTenantProps,
  ): SuperAdminAggregate {
    return new SuperAdminAggregate(actionedByUserId, actorTenantId, target);
  }

  get targetTenantId(): string {
    return this.targetState.tenantId;
  }

  get target(): SuperAdminTargetTenantProps {
    return this.targetState;
  }

  get actorTenantId(): string {
    return this.actorTenantIdValue;
  }

  get actionedBy(): string {
    return this.actionedByUserId;
  }

  isTargetActive(): boolean {
    return (
      this.target.status === SuperAdminTargetStatus.ACTIVE &&
      !this.target.deletedAt
    );
  }

  isTargetSuspended(): boolean {
    return this.target.status === SuperAdminTargetStatus.SUSPENDED;
  }

  isTargetDeactivated(): boolean {
    return (
      this.target.status === SuperAdminTargetStatus.DEACTIVATED ||
      !!this.target.deletedAt
    );
  }

  activate(): void {
    if (this.isTargetActive()) {
      throw new Error('Target tenant is already active');
    }

    this.target.status = SuperAdminTargetStatus.ACTIVE;
    this.target.deletedAt = null;

    this.addDomainEvent({
      type: DOMAIN_EVENTS.SUPER_ADMIN_TENANT_ACTIVATED,
      payload: {
        tenantId: this.actorTenantId,
        targetTenantId: this.target.tenantId,
        actionedByUserId: this.actionedByUserId,
      },
    });
  }

  suspend(reason?: string): void {
    if (this.isTargetSuspended()) {
      throw new Error('Target tenant is already suspended');
    }

    this.target.status = SuperAdminTargetStatus.SUSPENDED;

    this.addDomainEvent({
      type: DOMAIN_EVENTS.SUPER_ADMIN_TENANT_SUSPENDED,
      payload: {
        tenantId: this.actorTenantId,
        targetTenantId: this.target.tenantId,
        actionedByUserId: this.actionedByUserId,
        reason,
      },
    });
  }

  deactivate(reason?: string): void {
    if (this.isTargetDeactivated()) {
      throw new Error('Target tenant is already deactivated');
    }

    this.target.status = SuperAdminTargetStatus.DEACTIVATED;
    this.target.deletedAt = new Date();

    this.addDomainEvent({
      type: DOMAIN_EVENTS.SUPER_ADMIN_TENANT_DEACTIVATED,
      payload: {
        tenantId: this.actorTenantId,
        targetTenantId: this.target.tenantId,
        actionedByUserId: this.actionedByUserId,
        reason,
      },
    });
  }

  restore(): void {
    if (!this.isTargetDeactivated()) {
      throw new Error('Target tenant is not deactivated');
    }

    this.target.status = SuperAdminTargetStatus.ACTIVE;
    this.target.deletedAt = null;

    this.addDomainEvent({
      type: DOMAIN_EVENTS.SUPER_ADMIN_TENANT_RESTORED,
      payload: {
        tenantId: this.actorTenantId,
        targetTenantId: this.target.tenantId,
        actionedByUserId: this.actionedByUserId,
      },
    });
  }

  changePlan(newPlan: SuperAdminPlanProps, oldPlan: SuperAdminPlanProps): void {
    if (oldPlan.id === newPlan.id) {
      throw new Error('Target tenant is already on this plan');
    }

    this.addDomainEvent({
      type: DOMAIN_EVENTS.SUPER_ADMIN_PLAN_CHANGED,
      payload: {
        tenantId: this.actorTenantId,
        targetTenantId: this.target.tenantId,
        oldPlanId: oldPlan.id,
        newPlanId: newPlan.id,
        actionedByUserId: this.actionedByUserId,
      },
    });
  }

  changeSubscription(subscriptionId: string, reason?: string): void {
    this.addDomainEvent({
      type: DOMAIN_EVENTS.SUPER_ADMIN_SUBSCRIPTION_CHANGED,
      payload: {
        tenantId: this.actorTenantId,
        targetTenantId: this.target.tenantId,
        subscriptionId,
        actionedByUserId: this.actionedByUserId,
        reason,
      },
    });
  }
}
