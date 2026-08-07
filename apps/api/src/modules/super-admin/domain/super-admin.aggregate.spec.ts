import {
  SuperAdminAggregate,
  SuperAdminTargetStatus,
} from './super-admin.aggregate';
import { DOMAIN_EVENTS } from '../../../core/events/domain-events';

describe('SuperAdminAggregate', () => {
  const actor = { userId: 'user-1', tenantId: 'tenant-superadmin' };

  const makeTarget = (
    status = SuperAdminTargetStatus.ACTIVE,
    deletedAt: Date | null = null,
  ) => ({
    tenantId: 'tenant-1',
    status,
    deletedAt,
  });

  const activeTarget = () => makeTarget(SuperAdminTargetStatus.ACTIVE);
  const suspendedTarget = () => makeTarget(SuperAdminTargetStatus.SUSPENDED);
  const deactivatedTarget = () =>
    makeTarget(SuperAdminTargetStatus.DEACTIVATED, new Date());

  describe('activate', () => {
    it('should emit SUPER_ADMIN_TENANT_ACTIVATED', () => {
      const aggregate = SuperAdminAggregate.forTarget(
        actor.userId,
        actor.tenantId,
        suspendedTarget(),
      );

      aggregate.activate();

      const events = aggregate.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(DOMAIN_EVENTS.SUPER_ADMIN_TENANT_ACTIVATED);
      expect(events[0].payload).toMatchObject({
        tenantId: actor.tenantId,
        targetTenantId: 'tenant-1',
        actionedByUserId: actor.userId,
      });
    });

    it('should throw when target is already active', () => {
      const aggregate = SuperAdminAggregate.forTarget(
        actor.userId,
        actor.tenantId,
        activeTarget(),
      );

      expect(() => aggregate.activate()).toThrow(
        'Target tenant is already active',
      );
    });
  });

  describe('suspend', () => {
    it('should emit SUPER_ADMIN_TENANT_SUSPENDED with reason', () => {
      const aggregate = SuperAdminAggregate.forTarget(
        actor.userId,
        actor.tenantId,
        activeTarget(),
      );

      aggregate.suspend('Fraud');

      const events = aggregate.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(DOMAIN_EVENTS.SUPER_ADMIN_TENANT_SUSPENDED);
      expect(events[0].payload).toMatchObject({ reason: 'Fraud' });
    });

    it('should throw when target is already suspended', () => {
      const aggregate = SuperAdminAggregate.forTarget(
        actor.userId,
        actor.tenantId,
        suspendedTarget(),
      );

      expect(() => aggregate.suspend()).toThrow(
        'Target tenant is already suspended',
      );
    });
  });

  describe('deactivate', () => {
    it('should emit SUPER_ADMIN_TENANT_DEACTIVATED and set deletedAt', () => {
      const aggregate = SuperAdminAggregate.forTarget(
        actor.userId,
        actor.tenantId,
        activeTarget(),
      );

      aggregate.deactivate('Contract ended');

      expect(aggregate.target.deletedAt).not.toBeNull();
      expect(aggregate.isTargetDeactivated()).toBe(true);

      const events = aggregate.pullDomainEvents();
      expect(events[0].type).toBe(DOMAIN_EVENTS.SUPER_ADMIN_TENANT_DEACTIVATED);
      expect(events[0].payload).toMatchObject({ reason: 'Contract ended' });
    });

    it('should throw when target is already deactivated', () => {
      const aggregate = SuperAdminAggregate.forTarget(
        actor.userId,
        actor.tenantId,
        deactivatedTarget(),
      );

      expect(() => aggregate.deactivate()).toThrow(
        'Target tenant is already deactivated',
      );
    });
  });

  describe('restore', () => {
    it('should emit SUPER_ADMIN_TENANT_RESTORED', () => {
      const aggregate = SuperAdminAggregate.forTarget(
        actor.userId,
        actor.tenantId,
        deactivatedTarget(),
      );

      aggregate.restore();

      expect(aggregate.target.deletedAt).toBeNull();
      expect(aggregate.isTargetActive()).toBe(true);

      const events = aggregate.pullDomainEvents();
      expect(events[0].type).toBe(DOMAIN_EVENTS.SUPER_ADMIN_TENANT_RESTORED);
    });

    it('should throw when target is not deactivated', () => {
      const aggregate = SuperAdminAggregate.forTarget(
        actor.userId,
        actor.tenantId,
        activeTarget(),
      );

      expect(() => aggregate.restore()).toThrow(
        'Target tenant is not deactivated',
      );
    });
  });

  describe('changePlan', () => {
    it('should emit SUPER_ADMIN_PLAN_CHANGED with old/new plan ids', () => {
      const aggregate = SuperAdminAggregate.forTarget(
        actor.userId,
        actor.tenantId,
        activeTarget(),
      );

      aggregate.changePlan(
        { id: 'plan-2', type: 'BUSINESS', name: 'Business', priceCents: 49900 },
        { id: 'plan-1', type: 'FREE', name: 'Free', priceCents: 0 },
      );

      const events = aggregate.pullDomainEvents();
      expect(events[0].type).toBe(DOMAIN_EVENTS.SUPER_ADMIN_PLAN_CHANGED);
      expect(events[0].payload).toMatchObject({
        oldPlanId: 'plan-1',
        newPlanId: 'plan-2',
      });
    });

    it('should throw when plan is unchanged', () => {
      const aggregate = SuperAdminAggregate.forTarget(
        actor.userId,
        actor.tenantId,
        activeTarget(),
      );

      expect(() =>
        aggregate.changePlan(
          { id: 'plan-1', type: 'FREE', name: 'Free', priceCents: 0 },
          { id: 'plan-1', type: 'FREE', name: 'Free', priceCents: 0 },
        ),
      ).toThrow('Target tenant is already on this plan');
    });
  });

  describe('changeSubscription', () => {
    it('should emit SUPER_ADMIN_SUBSCRIPTION_CHANGED', () => {
      const aggregate = SuperAdminAggregate.forTarget(
        actor.userId,
        actor.tenantId,
        activeTarget(),
      );

      aggregate.changeSubscription('sub-1', 'manual adjustment');

      const events = aggregate.pullDomainEvents();
      expect(events[0].type).toBe(
        DOMAIN_EVENTS.SUPER_ADMIN_SUBSCRIPTION_CHANGED,
      );
      expect(events[0].payload).toMatchObject({
        subscriptionId: 'sub-1',
        reason: 'manual adjustment',
      });
    });
  });
});
