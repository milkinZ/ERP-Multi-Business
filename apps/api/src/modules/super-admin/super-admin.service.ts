import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { OutboxPublisher } from '../../infrastructure/events/outbox.publisher';
import { DomainEventBus } from '../../core/events/domain-event-bus.service';
import { PrismaService } from '../../core/database/prisma.service';

import { SuperAdminRepository } from './super-admin.repository';
import {
  SuperAdminAggregate,
  SuperAdminTargetStatus,
} from './domain/super-admin.aggregate';

export type SuperAdminActor = {
  userId: string;
  tenantId: string;
};

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly repository: SuperAdminRepository,
    private readonly outbox: OutboxPublisher,
    private readonly eventBus: DomainEventBus,
    // Prisma is used for transactional cross-tenant orchestration only.
    private readonly prisma: PrismaService,
  ) {}

  // ---- Tenant management -------------------------------------------------

  async listTenants(options: {
    page?: number;
    limit?: number;
    search?: string;
    includeDeactivated?: boolean;
  }) {
    return this.repository.findAllTenants(options);
  }

  async getTenant(tenantId: string) {
    const tenant = await this.repository.findTenantById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async activateTenant(actor: SuperAdminActor, tenantId: string) {
    const tenant = await this.repository.findTenantById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const aggregate = SuperAdminAggregate.forTarget(
      actor.userId,
      actor.tenantId,
      {
        tenantId,
        status: tenant.deletedAt
          ? SuperAdminTargetStatus.DEACTIVATED
          : SuperAdminTargetStatus.SUSPENDED,
        deletedAt: tenant.deletedAt,
      },
    );

    aggregate.activate();
    await this.emmitAggregate(aggregate);

    await this.repository.updateTenantDeletedAt(tenantId, null);

    return { tenantId, status: 'ACTIVE' };
  }

  async suspendTenant(
    actor: SuperAdminActor,
    tenantId: string,
    reason?: string,
  ) {
    const tenant = await this.repository.findTenantById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const aggregate = SuperAdminAggregate.forTarget(
      actor.userId,
      actor.tenantId,
      {
        tenantId,
        status: tenant.deletedAt
          ? SuperAdminTargetStatus.DEACTIVATED
          : SuperAdminTargetStatus.ACTIVE,
        deletedAt: tenant.deletedAt,
      },
    );

    aggregate.suspend(reason);
    await this.emmitAggregate(aggregate);

    return { tenantId, status: 'SUSPENDED' };
  }

  async deactivateTenant(
    actor: SuperAdminActor,
    tenantId: string,
    reason?: string,
  ) {
    const tenant = await this.repository.findTenantById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const aggregate = SuperAdminAggregate.forTarget(
      actor.userId,
      actor.tenantId,
      {
        tenantId,
        status: tenant.deletedAt
          ? SuperAdminTargetStatus.DEACTIVATED
          : SuperAdminTargetStatus.ACTIVE,
        deletedAt: tenant.deletedAt,
      },
    );

    aggregate.deactivate(reason);
    await this.emmitAggregate(aggregate);

    await this.repository.updateTenantDeletedAt(tenantId, new Date());

    return { tenantId, status: 'DEACTIVATED' };
  }

  async restoreTenant(actor: SuperAdminActor, tenantId: string) {
    const tenant = await this.repository.findTenantById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const aggregate = SuperAdminAggregate.forTarget(
      actor.userId,
      actor.tenantId,
      {
        tenantId,
        status: tenant.deletedAt
          ? SuperAdminTargetStatus.DEACTIVATED
          : SuperAdminTargetStatus.ACTIVE,
        deletedAt: tenant.deletedAt,
      },
    );

    aggregate.restore();
    await this.emmitAggregate(aggregate);

    await this.repository.updateTenantDeletedAt(tenantId, null);

    return { tenantId, status: 'ACTIVE' };
  }

  // ---- Plans -------------------------------------------------------------

  async listPlans() {
    return this.repository.findAllPlans();
  }

  async createPlan(data: { type: string; name: string; priceCents: number }) {
    const existing = await this.repository.findPlanByType(data.type);
    if (existing) {
      throw new ConflictException('A plan with this type already exists');
    }
    return this.repository.createPlan(data);
  }

  async updatePlan(id: string, data: { name?: string; priceCents?: number }) {
    const plan = await this.repository.findPlanById(id);
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
    return this.repository.updatePlan(id, data);
  }

  async deletePlan(id: string) {
    const plan = await this.repository.findPlanById(id);
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
    return this.repository.softDeletePlan(id);
  }

  // ---- Subscriptions -----------------------------------------------------

  async listSubscriptions() {
    return this.repository.findAllSubscriptions();
  }

  async changeTenantPlan(
    actor: SuperAdminActor,
    tenantId: string,
    newPlanId: string,
  ) {
    const subscription =
      await this.repository.findSubscriptionByTenantId(tenantId);
    if (!subscription) {
      throw new NotFoundException('No active subscription for this tenant');
    }
    if (!subscription.planId) {
      throw new NotFoundException('Subscription has no plan');
    }

    const newPlan = await this.repository.findPlanById(newPlanId);
    if (!newPlan) {
      throw new NotFoundException('Target plan not found');
    }

    const oldPlan = subscription.plan;
    if (!oldPlan) {
      throw new NotFoundException('Old plan not found');
    }

    const aggregate = SuperAdminAggregate.forTarget(
      actor.userId,
      actor.tenantId,
      {
        tenantId,
        status: SuperAdminTargetStatus.ACTIVE,
        deletedAt: null,
      },
    );

    aggregate.changePlan(
      {
        id: newPlan.id,

        type: newPlan.type,
        name: newPlan.name,
        priceCents: newPlan.priceCents,
      },
      {
        id: oldPlan.id,

        type: oldPlan.type,
        name: oldPlan.name,
        priceCents: oldPlan.priceCents,
      },
    );

    await this.emmitAggregate(aggregate);

    // Update the target subscription's planId.
    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { planId: newPlan.id },
    });

    return { tenantId, newPlanId };
  }

  async listInvoices() {
    return this.repository.findAllInvoices();
  }

  // ---- Feature flags -----------------------------------------------------

  async listFeatureFlags() {
    return this.repository.findAllFeatureFlags();
  }

  // ---- Helpers -----------------------------------------------------------

  private async emmitAggregate(aggregate: SuperAdminAggregate) {
    const events = aggregate.pullDomainEvents();
    for (const event of events) {
      await this.outbox.publish(event);
      await this.eventBus.publish(event);
    }
  }
}
