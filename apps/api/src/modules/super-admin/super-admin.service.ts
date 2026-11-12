import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, TenantStatus } from '@prisma/client';

import { OutboxPublisher } from '../../infrastructure/events/outbox.publisher';
import { PrismaService } from '../../core/database/prisma.service';
import { PlatformAuditLogService } from '../audit-logs/platform-audit-log.service';
import { ListPlatformAuditLogsDto } from '../audit-logs/dto/list-platform-audit-logs.dto';
import { DOMAIN_EVENTS } from '../../core/events/domain-events';
import {
  createInvoiceCsvStream,
  invoiceExportDateBounds,
} from '../billing/invoice-export';
import type { InvoiceExportFilters } from '../billing/dto/invoice-export-query.dto';
import type { ListPlatformInvoicesDto } from './dto/list-platform-invoices.dto';

import { SuperAdminRepository } from './super-admin.repository';
import type { PlatformBillingAggregateResponse } from './dto/platform-billing-aggregate-response.dto';
import type { PlatformInvoiceResponse } from './dto/platform-invoice-response.dto';
import type { PlatformSubscriptionResponse } from './dto/platform-subscription-response.dto';
import type { PlatformWorkerResponse } from './dto/platform-worker-response.dto';
import { ListPlatformJobExecutionsDto } from './dto/list-platform-job-executions.dto';
import {
  SuperAdminAggregate,
  SuperAdminTargetStatus,
} from './domain/super-admin.aggregate';
import { getPlanCatalogEntry } from '../subscription/plans/plan-catalog';
import { DEFAULT_PLAN_MODULE_KEYS } from '../subscription/plans/plan-module-defaults';
import { BillingService } from '../billing/billing.service';
import { requestContext } from '../../core/request-context/request-context';

export type SuperAdminActor = {
  platformIdentityId: string;
};

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly repository: SuperAdminRepository,
    private readonly outbox: OutboxPublisher,
    private readonly platformAuditLog: PlatformAuditLogService,
    // Prisma is used for transactional cross-tenant orchestration only.
    private readonly prisma: PrismaService,
    @Optional() private readonly billingService?: BillingService,
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
    if (tenant.status !== TenantStatus.SUSPENDED || tenant.deletedAt !== null) {
      throw new ConflictException('Only suspended tenants can be activated');
    }

    return this.prisma.$transaction(async (tx) => {
      const aggregate = SuperAdminAggregate.forTarget(
        actor.platformIdentityId,
        {
          tenantId,
          status: this.toAggregateStatus(tenant.status),
          deletedAt: tenant.deletedAt,
        },
      );

      aggregate.activate();
      const updated = await tx.tenant.updateMany({
        where: {
          id: tenantId,
          status: TenantStatus.SUSPENDED,
          deletedAt: null,
        },
        data: { status: TenantStatus.ACTIVE },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Tenant state changed; retry the action');
      }
      await this.platformAuditLog.create(
        {
          actor,
          action: 'super-admin.tenant.activated',
          resourceType: 'TENANT',
          resourceId: tenantId,
          targetTenantId: tenantId,
          metadata: { to: 'ACTIVE' },
        },
        tx,
      );
      await this.persistAggregateEvents(aggregate, tx);

      return { tenantId, status: 'ACTIVE' };
    });
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
    if (tenant.status !== TenantStatus.ACTIVE || tenant.deletedAt !== null) {
      throw new ConflictException('Only active tenants can be suspended');
    }

    return this.prisma.$transaction(async (tx) => {
      const aggregate = SuperAdminAggregate.forTarget(
        actor.platformIdentityId,
        {
          tenantId,
          status: this.toAggregateStatus(tenant.status),
          deletedAt: tenant.deletedAt,
        },
      );

      aggregate.suspend(reason);
      const updated = await tx.tenant.updateMany({
        where: {
          id: tenantId,
          status: TenantStatus.ACTIVE,
          deletedAt: null,
        },
        data: { status: TenantStatus.SUSPENDED },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Tenant state changed; retry the action');
      }
      await this.platformAuditLog.create(
        {
          actor,
          action: 'super-admin.tenant.suspended',
          resourceType: 'TENANT',
          resourceId: tenantId,
          targetTenantId: tenantId,
          metadata: { to: 'SUSPENDED', ...(reason ? { reason } : {}) },
        },
        tx,
      );
      await this.persistAggregateEvents(aggregate, tx);

      return { tenantId, status: 'SUSPENDED' };
    });
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
    if (
      (tenant.status !== TenantStatus.ACTIVE &&
        tenant.status !== TenantStatus.SUSPENDED) ||
      tenant.deletedAt !== null
    ) {
      throw new ConflictException(
        'Only operational tenants can be deactivated',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const aggregate = SuperAdminAggregate.forTarget(
        actor.platformIdentityId,
        {
          tenantId,
          status: this.toAggregateStatus(tenant.status),
          deletedAt: tenant.deletedAt,
        },
      );

      aggregate.deactivate(reason);
      const deactivatedAt = new Date();
      const updated = await tx.tenant.updateMany({
        where: {
          id: tenantId,
          status: { in: [TenantStatus.ACTIVE, TenantStatus.SUSPENDED] },
          deletedAt: null,
        },
        data: {
          status: TenantStatus.DEACTIVATED,
          deletedAt: deactivatedAt,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Tenant state changed; retry the action');
      }
      await this.platformAuditLog.create(
        {
          actor,
          action: 'super-admin.tenant.deactivated',
          resourceType: 'TENANT',
          resourceId: tenantId,
          targetTenantId: tenantId,
          metadata: { to: 'DEACTIVATED', ...(reason ? { reason } : {}) },
        },
        tx,
      );
      await this.persistAggregateEvents(aggregate, tx);

      return { tenantId, status: 'DEACTIVATED' };
    });
  }

  async restoreTenant(actor: SuperAdminActor, tenantId: string) {
    const tenant = await this.repository.findTenantById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    if (
      tenant.status !== TenantStatus.DEACTIVATED ||
      tenant.deletedAt === null
    ) {
      throw new ConflictException('Only deactivated tenants can be restored');
    }

    return this.prisma.$transaction(async (tx) => {
      const aggregate = SuperAdminAggregate.forTarget(
        actor.platformIdentityId,
        {
          tenantId,
          status: this.toAggregateStatus(tenant.status),
          deletedAt: tenant.deletedAt,
        },
      );

      aggregate.restore();
      const updated = await tx.tenant.updateMany({
        where: {
          id: tenantId,
          status: TenantStatus.DEACTIVATED,
          deletedAt: { not: null },
        },
        data: { status: TenantStatus.ACTIVE, deletedAt: null },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Tenant state changed; retry the action');
      }
      await this.platformAuditLog.create(
        {
          actor,
          action: 'super-admin.tenant.restored',
          resourceType: 'TENANT',
          resourceId: tenantId,
          targetTenantId: tenantId,
          metadata: { to: 'ACTIVE' },
        },
        tx,
      );
      await this.persistAggregateEvents(aggregate, tx);

      return { tenantId, status: 'ACTIVE' };
    });
  }

  // ---- Plans -------------------------------------------------------------

  async listPlans() {
    return this.repository.findAllPlans();
  }

  async createPlan(
    actor: SuperAdminActor,
    data: {
      type: string;
      name: string;
      priceCents: number;
      maxOutlets?: number | null;
      maxUsers?: number | null;
      maxMonthlyOrders?: number | null;
      moduleIds?: string[];
    },
  ) {
    const existing = await this.repository.findPlanByType(data.type);
    if (existing) {
      throw new ConflictException('A plan with this type already exists');
    }
    let defaults: ReturnType<typeof getPlanCatalogEntry>;
    try {
      defaults = getPlanCatalogEntry(data.type);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Unsupported plan type',
      );
    }

    const defaultModuleKeys = DEFAULT_PLAN_MODULE_KEYS[defaults.type];
    const modules =
      data.moduleIds === undefined
        ? await this.repository.findFeatureModulesByKeys([...defaultModuleKeys])
        : await this.repository.findFeatureModulesByIds(data.moduleIds);
    if (
      modules.length !==
      (data.moduleIds === undefined
        ? defaultModuleKeys.length
        : new Set(data.moduleIds).size)
    ) {
      if (data.moduleIds === undefined) {
        throw new ServiceUnavailableException(
          'The default plan modules are not fully configured or active',
        );
      }
      throw new NotFoundException(
        'One or more active feature modules not found',
      );
    }
    const moduleIds = data.moduleIds ?? modules.map((module) => module.id);

    return this.prisma.$transaction(async (tx) => {
      const plan = await this.repository.createPlan(
        {
          ...data,
          moduleIds,
          maxOutlets:
            data.maxOutlets === undefined
              ? defaults.maxOutlets
              : data.maxOutlets,
          maxUsers:
            data.maxUsers === undefined ? defaults.maxUsers : data.maxUsers,
          maxMonthlyOrders:
            data.maxMonthlyOrders === undefined
              ? defaults.maxMonthlyOrders
              : data.maxMonthlyOrders,
        },
        tx,
      );
      await this.platformAuditLog.create(
        {
          actor,
          action: 'super-admin.plan.created',
          resourceType: 'PLAN',
          resourceId: plan.id,
          metadata: {
            type: plan.type,
            moduleIds,
          },
        },
        tx,
      );
      return plan;
    });
  }

  async updatePlan(
    actor: SuperAdminActor,
    id: string,
    data: {
      name?: string;
      priceCents?: number;
      maxOutlets?: number | null;
      maxUsers?: number | null;
      maxMonthlyOrders?: number | null;
      moduleIds?: string[];
    },
  ) {
    const plan = await this.repository.findPlanById(id);
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
    const moduleIds = data.moduleIds;
    if (moduleIds !== undefined) {
      const modules = await this.repository.findFeatureModulesByIds(moduleIds);
      if (modules.length !== new Set(moduleIds).size) {
        throw new NotFoundException(
          'One or more active feature modules not found',
        );
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await this.repository.updatePlan(id, data, tx);
      await this.platformAuditLog.create(
        {
          actor,
          action: 'super-admin.plan.updated',
          resourceType: 'PLAN',
          resourceId: id,
          metadata: {
            changedFields: Object.keys(data),
            moduleIds:
              moduleIds ?? plan.modules?.map((item) => item.moduleId) ?? [],
          },
        },
        tx,
      );
      return updated;
    });
  }

  async deletePlan(actor: SuperAdminActor, id: string) {
    const plan = await this.repository.findPlanById(id);
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
    return this.prisma.$transaction(async (tx) => {
      const deleted = await this.repository.softDeletePlan(id, tx);
      await this.platformAuditLog.create(
        {
          actor,
          action: 'super-admin.plan.archived',
          resourceType: 'PLAN',
          resourceId: id,
          metadata: { type: plan.type },
        },
        tx,
      );
      return deleted;
    });
  }

  // ---- Subscriptions -----------------------------------------------------

  async listSubscriptions() {
    const subscriptions = await this.repository.findAllSubscriptions();
    return subscriptions.map((subscription) =>
      this.toPlatformSubscriptionResponse(subscription),
    );
  }

  async getSubscription(id: string) {
    const subscription = await this.repository.findSubscriptionById(id);
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    return this.toPlatformSubscriptionResponse(subscription);
  }

  async listWorkers(): Promise<PlatformWorkerResponse[]> {
    const workers = await this.prisma.workerInstance.findMany({
      orderBy: { lastHeartbeatAt: 'desc' },
    });
    const staleThresholdMs = Number(
      process.env.WORKER_STALE_THRESHOLD_MS ?? 45_000,
    );
    const now = Date.now();

    return workers.map((worker) => {
      const lastHeartbeatAt = new Date(worker.lastHeartbeatAt).getTime();
      const status: PlatformWorkerResponse['status'] =
        worker.stoppedAt !== null
          ? 'STOPPED'
          : now - lastHeartbeatAt > staleThresholdMs
            ? 'STALE'
            : worker.status;

      return {
        id: worker.id,
        workerKey: worker.workerKey,
        name: worker.name,
        hostname: worker.hostname,
        instancePid: worker.instancePid,
        version: worker.version,
        status,
        startedAt: worker.startedAt,
        lastHeartbeatAt: worker.lastHeartbeatAt,
        stoppedAt: worker.stoppedAt,
        createdAt: worker.createdAt,
        updatedAt: worker.updatedAt,
      };
    });
  }

  async getWorker(id: string): Promise<PlatformWorkerResponse> {
    const worker = await this.prisma.workerInstance.findUnique({
      where: { id },
    });
    if (!worker) {
      throw new NotFoundException('Worker not found');
    }

    const staleThresholdMs = Number(
      process.env.WORKER_STALE_THRESHOLD_MS ?? 45_000,
    );
    const now = Date.now();
    const lastHeartbeatAt = new Date(worker.lastHeartbeatAt).getTime();
    const status: PlatformWorkerResponse['status'] =
      worker.stoppedAt !== null
        ? 'STOPPED'
        : now - lastHeartbeatAt > staleThresholdMs
          ? 'STALE'
          : worker.status;

    return {
      id: worker.id,
      workerKey: worker.workerKey,
      name: worker.name,
      hostname: worker.hostname,
      instancePid: worker.instancePid,
      version: worker.version,
      status,
      startedAt: worker.startedAt,
      lastHeartbeatAt: worker.lastHeartbeatAt,
      stoppedAt: worker.stoppedAt,
      createdAt: worker.createdAt,
      updatedAt: worker.updatedAt,
    };
  }

  async listJobExecutions(query: ListPlatformJobExecutionsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const where: Prisma.JobExecutionWhereInput = {
      ...(query.queueName ? { queueName: query.queueName } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [records, total] = await Promise.all([
      this.prisma.jobExecution.findMany({
        where,
        take: limit,
        skip: (page - 1) * limit,
        orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          queueName: true,
          jobName: true,
          workerId: true,
          attemptNumber: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          durationMs: true,
          errorCategory: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.jobExecution.count({ where }),
    ]);

    return {
      data: records.map((record) => ({
        id: record.id,
        queueName: record.queueName,
        jobName: record.jobName,
        workerId: record.workerId,
        attemptNumber: record.attemptNumber,
        status: record.status,
        startedAt: record.startedAt,
        finishedAt: record.finishedAt,
        durationMs: record.durationMs,
        errorCategory: record.errorCategory,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
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
    const pendingPlanId = newPlan.id === oldPlan.id ? null : newPlan.id;
    if (pendingPlanId === subscription.pendingPlanId) {
      return {
        tenantId,
        newPlanId,
        pendingPlanId,
        effectiveAt: 'NEXT_RENEWAL' as const,
      };
    }

    return this.prisma.$transaction(async (tx) => {
      const aggregate = SuperAdminAggregate.forTarget(
        actor.platformIdentityId,
        {
          tenantId,
          status: SuperAdminTargetStatus.ACTIVE,
          deletedAt: null,
        },
      );

      if (newPlan.id !== oldPlan.id) {
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
      }

      const updated = await tx.subscription.updateMany({
        where: {
          id: subscription.id,
          planId: oldPlan.id,
          pendingPlanId: subscription.pendingPlanId,
        },
        data: {
          pendingPlanId,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'Subscription plan changed; retry the action',
        );
      }
      await this.outbox.publish(
        {
          type: DOMAIN_EVENTS.SUBSCRIPTION_PLAN_CHANGE_SCHEDULED,
          payload: {
            subscriptionId: subscription.id,
            tenantId,
            currentPlanId: oldPlan.id,
            previousPendingPlanId: subscription.pendingPlanId,
            pendingPlanId,
            effectiveAt: 'NEXT_RENEWAL',
          },
        },
        tx,
      );
      await this.platformAuditLog.create(
        {
          actor,
          action: 'super-admin.plan.change-scheduled',
          resourceType: 'SUBSCRIPTION',
          resourceId: subscription.id,
          targetTenantId: tenantId,
          metadata: {
            currentPlanId: oldPlan.id,
            previousPendingPlanId: subscription.pendingPlanId,
            pendingPlanId,
            effectiveAt: 'NEXT_RENEWAL',
          },
        },
        tx,
      );
      await tx.subscriptionHistory.create({
        data: {
          subscriptionId: subscription.id,
          tenantId,
          eventType: DOMAIN_EVENTS.SUBSCRIPTION_PLAN_CHANGE_SCHEDULED,
          actorPlatformIdentityId: actor.platformIdentityId,
          actorType: 'PLATFORM_IDENTITY',
          metadata: {
            currentPlanId: oldPlan.id,
            previousPendingPlanId: subscription.pendingPlanId,
            pendingPlanId,
            effectiveAt: 'NEXT_RENEWAL',
          },
        },
      });
      await this.persistAggregateEvents(aggregate, tx);

      return {
        tenantId,
        newPlanId,
        pendingPlanId,
        effectiveAt: 'NEXT_RENEWAL' as const,
      };
    });
  }

  async listInvoices(query: ListPlatformInvoicesDto) {
    const dateBounds = invoiceExportDateBounds(query);
    const result = await this.repository.findAllInvoices(
      {
        ...(query.tenantId ? { tenantId: query.tenantId } : {}),
        ...(query.subscriptionId
          ? { subscriptionId: query.subscriptionId }
          : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(dateBounds.from || dateBounds.to
          ? {
              createdAt: {
                ...(dateBounds.from ? { gte: dateBounds.from } : {}),
                ...(dateBounds.to ? { lte: dateBounds.to } : {}),
              },
            }
          : {}),
      },
      query.page,
      query.limit,
    );
    return {
      ...result,
      data: result.data.map((invoice) =>
        this.toPlatformInvoiceResponse(invoice),
      ),
    };
  }

  async executePlatformBilling(
    actor: SuperAdminActor,
    tenantId: string,
    subscriptionId: string,
    action: 'execute' | 'renew',
  ) {
    const subscription =
      await this.repository.findSubscriptionById(subscriptionId);
    if (!subscription || subscription.tenantId !== tenantId) {
      throw new NotFoundException('Subscription not found for tenant');
    }

    await this.platformAuditLog.create({
      actor,
      action: `super-admin.billing.${action}.requested`,
      resourceType: 'SUBSCRIPTION',
      resourceId: subscriptionId,
      targetTenantId: tenantId,
      metadata: { subscriptionId, action, outcome: 'REQUESTED' },
    });

    const billing = this.requireBillingService();
    return requestContext.run(
      { tenantId, platformIdentityId: actor.platformIdentityId },
      () =>
        action === 'execute'
          ? billing.executeBilling(subscriptionId)
          : billing.renewSubscription(subscriptionId),
    );
  }

  async cancelPlatformPendingInvoice(
    actor: SuperAdminActor,
    tenantId: string,
    invoiceId: string,
  ) {
    const invoice = await this.repository.findInvoiceById(invoiceId);
    if (!invoice || invoice.tenantId !== tenantId) {
      throw new NotFoundException('Invoice not found for tenant');
    }

    await this.platformAuditLog.create({
      actor,
      action: 'super-admin.billing.invoice-cancel.requested',
      resourceType: 'INVOICE',
      resourceId: invoiceId,
      targetTenantId: tenantId,
      metadata: { invoiceNumber: invoice.invoiceNumber, outcome: 'REQUESTED' },
    });

    return requestContext.run(
      { tenantId, platformIdentityId: actor.platformIdentityId },
      () => this.requireBillingService().cancelPendingInvoice(invoiceId),
    );
  }

  async refundPlatformInvoice(
    actor: SuperAdminActor,
    tenantId: string,
    invoiceId: string,
    amountCents: number,
    reason: string,
  ) {
    const invoice = await this.repository.findInvoiceById(invoiceId);
    if (!invoice || invoice.tenantId !== tenantId) {
      throw new NotFoundException('Invoice not found for tenant');
    }

    await this.platformAuditLog.create({
      actor,
      action: 'super-admin.billing.invoice-refund.requested',
      resourceType: 'INVOICE',
      resourceId: invoiceId,
      targetTenantId: tenantId,
      metadata: {
        amountCents,
        reason,
        invoiceNumber: invoice.invoiceNumber,
        outcome: 'REQUESTED',
      },
    });

    return requestContext.run(
      { tenantId, platformIdentityId: actor.platformIdentityId },
      () =>
        this.requireBillingService().refundInvoice(
          invoiceId,
          amountCents,
          reason,
          { type: 'PLATFORM_IDENTITY', id: actor.platformIdentityId },
        ),
    );
  }

  async getBillingAggregate(): Promise<PlatformBillingAggregateResponse> {
    return this.repository.getBillingAggregate();
  }

  async exportInvoices(actor: SuperAdminActor, filters: InvoiceExportFilters) {
    const dateBounds = invoiceExportDateBounds(filters);
    await this.platformAuditLog.create({
      actor,
      action: 'super-admin.invoice-export.requested',
      resourceType: 'INVOICE_EXPORT',
      resourceId: 'platform',
      metadata: {
        from: filters.from ?? null,
        to: filters.to ?? null,
        status: filters.status ?? null,
        tenantId: filters.tenantId ?? null,
        subscriptionId: filters.subscriptionId ?? null,
      },
    });

    return createInvoiceCsvStream(
      (cursor, take) =>
        this.repository.findInvoiceExportPage(
          {
            deletedAt: null,
            ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
            ...(filters.subscriptionId
              ? { subscriptionId: filters.subscriptionId }
              : {}),
            ...(filters.status ? { status: filters.status } : {}),
            ...(dateBounds.from || dateBounds.to
              ? {
                  createdAt: {
                    ...(dateBounds.from ? { gte: dateBounds.from } : {}),
                    ...(dateBounds.to ? { lte: dateBounds.to } : {}),
                  },
                }
              : {}),
          },
          cursor,
          take,
        ),
      true,
    );
  }

  async listPlatformAuditLogs(query: ListPlatformAuditLogsDto) {
    return this.platformAuditLog.list(query);
  }

  async getPlatformAuditLog(id: string) {
    return this.platformAuditLog.getById(id);
  }

  async getInvoice(id: string) {
    const invoice = await this.repository.findInvoiceById(id);
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return this.toPlatformInvoiceResponse(invoice);
  }

  async getPlatformInvoiceRefunds(tenantId: string, invoiceId: string) {
    const invoice = await this.repository.findInvoiceById(invoiceId);
    if (!invoice || invoice.tenantId !== tenantId) {
      throw new NotFoundException('Invoice not found for tenant');
    }

    return requestContext.run({ tenantId }, () =>
      this.requireBillingService().getInvoiceRefunds(invoiceId),
    );
  }

  // ---- Feature flags -----------------------------------------------------

  async listFeatureFlags() {
    return this.repository.findAllFeatureFlags();
  }

  listFeatureModules() {
    return this.repository.findAllFeatureModules();
  }

  async updateFeatureModule(
    actor: SuperAdminActor,
    id: string,
    data: {
      name?: string;
      description?: string | null;
      monthlyPriceCents?: number;
      isActive?: boolean;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.featureModule.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Feature module not found');
      const updated = await tx.featureModule.update({
        where: { id },
        data: {
          ...data,
          ...(data.name !== undefined ? { name: data.name.trim() } : {}),
          ...(data.description !== undefined
            ? { description: data.description?.trim() || null }
            : {}),
        },
      });
      await this.platformAuditLog.create(
        {
          actor,
          action: 'super-admin.feature-module.updated',
          resourceType: 'FEATURE_MODULE',
          resourceId: id,
          metadata: {
            changedFields: Object.keys(data),
            oldMonthlyPriceCents: current.monthlyPriceCents,
            newMonthlyPriceCents: updated.monthlyPriceCents,
          },
        },
        tx,
      );
      return updated;
    });
  }

  async listTenantFeatureFlags(tenantId: string) {
    const tenant = await this.repository.findTenantById(tenantId);
    if (!tenant) throw new NotFoundException('Tenant not found');
    return requestContext.run({ tenantId }, async () => {
      const [flags, subscription, modules] = await Promise.all([
        this.prisma.featureFlag.findMany({
          where: { tenantId, deletedAt: null },
          orderBy: { key: 'asc' },
        }),
        this.prisma.subscription.findFirst({
          where: { tenantId, deletedAt: null },
          select: {
            plan: { select: { modules: { select: { moduleId: true } } } },
            modules: {
              where: { status: { in: ['ACTIVE', 'PENDING_REMOVE'] } },
              select: { moduleId: true, status: true },
            },
          },
        }),
        this.prisma.featureModule.findMany({
          orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        }),
      ]);
      const entitledModuleIds = new Set([
        ...(subscription?.plan.modules.map((item) => item.moduleId) ?? []),
        ...(subscription?.modules.map((item) => item.moduleId) ?? []),
      ]);
      return {
        flags,
        modules,
        entitledModuleIds: [...entitledModuleIds],
      };
    });
  }

  async updateTenantFeatureFlag(
    actor: SuperAdminActor,
    tenantId: string,
    key: string,
    enabled: boolean,
  ) {
    const tenant = await this.repository.findTenantById(tenantId);
    if (!tenant) throw new NotFoundException('Tenant not found');

    return requestContext.run(
      { tenantId, platformIdentityId: actor.platformIdentityId },
      () =>
        this.prisma.$transaction(async (tx) => {
          const module = await tx.featureModule.findUnique({
            where: { key },
            select: { id: true },
          });
          if (enabled && module) {
            const subscription = await tx.subscription.findFirst({
              where: { tenantId, deletedAt: null },
              select: {
                id: true,
                plan: {
                  select: {
                    modules: {
                      where: { moduleId: module.id },
                      select: { moduleId: true },
                    },
                  },
                },
              },
            });
            const purchasedModule = subscription
              ? await tx.subscriptionFeatureModule.findFirst({
                  where: {
                    subscriptionId: subscription.id,
                    tenantId,
                    moduleId: module.id,
                    status: 'ACTIVE',
                  },
                  select: { id: true },
                })
              : null;
            if (!subscription?.plan.modules.length && !purchasedModule) {
              throw new ConflictException(
                'This module is not included in the tenant plan or active add-ons',
              );
            }
          }

          const flag = await tx.featureFlag.upsert({
            where: { tenantId_key: { tenantId, key } },
            create: { tenantId, key, enabled },
            update: { enabled, deletedAt: null },
          });
          await this.platformAuditLog.create(
            {
              actor,
              action: 'super-admin.tenant-feature-flag.updated',
              resourceType: 'FEATURE_FLAG',
              resourceId: flag.id,
              targetTenantId: tenantId,
              metadata: { key, enabled },
            },
            tx,
          );
          return flag;
        }),
    );
  }

  // ---- Helpers -----------------------------------------------------------

  private requireBillingService(): BillingService {
    if (!this.billingService) {
      throw new Error('BillingService is not available in the platform module');
    }
    return this.billingService;
  }

  private async persistAggregateEvents(
    aggregate: SuperAdminAggregate,
    client: Prisma.TransactionClient,
  ) {
    const events = aggregate.pullDomainEvents();
    for (const event of events) {
      await this.outbox.publish(event, client);
    }
  }

  private toAggregateStatus(status: TenantStatus): SuperAdminTargetStatus {
    switch (status) {
      case TenantStatus.ACTIVE:
        return SuperAdminTargetStatus.ACTIVE;
      case TenantStatus.SUSPENDED:
        return SuperAdminTargetStatus.SUSPENDED;
      case TenantStatus.DEACTIVATED:
        return SuperAdminTargetStatus.DEACTIVATED;
      default:
        throw new Error('Unsupported tenant status');
    }
  }

  private toPlatformSubscriptionResponse(subscription: {
    id: string;
    tenantId: string;
    planId: string;
    pendingPlanId: string | null;
    status: PlatformSubscriptionResponse['status'];
    startedAt: Date;
    endedAt: Date | null;
    plan: PlatformSubscriptionResponse['plan'];
    tenant: PlatformSubscriptionResponse['tenant'];
  }): PlatformSubscriptionResponse {
    return {
      id: subscription.id,
      tenantId: subscription.tenantId,
      planId: subscription.planId,
      pendingPlanId: subscription.pendingPlanId,
      pendingPlanEffectiveAt: subscription.pendingPlanId
        ? 'NEXT_RENEWAL'
        : null,
      status: subscription.status,
      planType: subscription.plan.type,
      priceCents: subscription.plan.priceCents,
      startedAt: subscription.startedAt,
      endedAt: subscription.endedAt,
      tenant: {
        id: subscription.tenant.id,
        name: subscription.tenant.name,
      },
      plan: {
        id: subscription.plan.id,
        type: subscription.plan.type,
        name: subscription.plan.name,
        priceCents: subscription.plan.priceCents,
      },
    };
  }

  private toPlatformInvoiceResponse(invoice: {
    id: string;
    tenantId: string;
    subscriptionId: string | null;
    invoiceNumber: string;
    amountCents: number;
    refundedAmountCents: number;
    currency: string;
    status: string;
    dueAt: Date | null;
    paidAt: Date | null;
    createdAt: Date;
    tenant: PlatformInvoiceResponse['tenant'];
  }): PlatformInvoiceResponse {
    return {
      id: invoice.id,
      tenantId: invoice.tenantId,
      subscriptionId: invoice.subscriptionId,
      invoiceNumber: invoice.invoiceNumber,
      amountCents: invoice.amountCents,
      refundedAmountCents: invoice.refundedAmountCents,
      currency: invoice.currency,
      status: invoice.status,
      dueAt: invoice.dueAt,
      paidAt: invoice.paidAt,
      createdAt: invoice.createdAt,
      tenant: {
        id: invoice.tenant.id,
        name: invoice.tenant.name,
      },
    };
  }
}
