import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../../core/database/repositories/base.repository';
import { PrismaService } from '../../../core/database/prisma.service';
import { getPlanCatalogEntry } from './plan-catalog';

@Injectable()
export class PlanRepository extends BaseRepository {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async findAll() {
    return this.prisma.plan.findMany({
      where: { deletedAt: null },
      orderBy: { priceCents: 'asc' },
    });
  }

  async findById(id: string) {
    return this.prisma.plan.findFirst({
      where: { id, deletedAt: null },
    });
  }

  async findByType(type: string) {
    return this.prisma.plan.findFirst({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      where: { type: type as any, deletedAt: null },
    });
  }

  async create(data: {
    type: string;
    name: string;
    priceCents: number;
    maxOutlets?: number | null;
    maxUsers?: number | null;
    maxMonthlyOrders?: number | null;
  }) {
    const defaults = getPlanCatalogEntry(data.type);
    return this.prisma.plan.create({
      data: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        type: data.type as any,
        name: data.name,
        priceCents: data.priceCents,
        maxOutlets:
          data.maxOutlets === undefined ? defaults.maxOutlets : data.maxOutlets,
        maxUsers:
          data.maxUsers === undefined ? defaults.maxUsers : data.maxUsers,
        maxMonthlyOrders:
          data.maxMonthlyOrders === undefined
            ? defaults.maxMonthlyOrders
            : data.maxMonthlyOrders,
      },
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      priceCents?: number;
      maxOutlets?: number | null;
      maxUsers?: number | null;
      maxMonthlyOrders?: number | null;
    },
  ) {
    return this.prisma.plan.update({
      where: { id },
      data,
    });
  }

  async softDelete(id: string) {
    return this.prisma.plan.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  listFeatureModules() {
    return this.prisma.featureModule.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async getSubscriptionModuleSelection(
    subscriptionId: string,
    tenantId: string,
  ) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, tenantId, deletedAt: null },
      include: {
        plan: { include: { modules: { select: { moduleId: true } } } },
        modules: { include: { featureModule: true } },
      },
    });
    if (!subscription) return null;

    const included = new Set(
      subscription.plan.modules.map((module) => module.moduleId),
    );
    const selected = new Map(
      subscription.modules.map((module) => [module.moduleId, module.status]),
    );
    const modules = await this.prisma.featureModule.findMany({
      orderBy: { name: 'asc' },
    });
    return {
      modules: modules.map((module) => {
        const status = selected.get(module.id) ?? null;
        const isIncluded = included.has(module.id);
        return {
          ...module,
          isIncluded,
          selected:
            isIncluded || status === 'ACTIVE' || status === 'PENDING_ADD',
          status,
        };
      }),
    };
  }

  async scheduleSubscriptionModules(
    subscriptionId: string,
    tenantId: string,
    requestedModuleIds: string[],
    actorUserId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.findFirst({
        where: { id: subscriptionId, tenantId, deletedAt: null },
        include: { plan: { include: { modules: true } } },
      });
      if (!subscription) return null;

      const includedModuleIds = new Set(
        subscription.plan.modules.map((module) => module.moduleId),
      );
      const desiredModuleIds = new Set(
        requestedModuleIds.filter((id) => !includedModuleIds.has(id)),
      );
      const existingModules = await tx.subscriptionFeatureModule.findMany({
        where: { subscriptionId, tenantId },
      });
      const existingByModuleId = new Map(
        existingModules.map((module) => [module.moduleId, module]),
      );

      for (const existing of existingModules) {
        const desired = desiredModuleIds.has(existing.moduleId);
        if (existing.status === 'ACTIVE' && !desired) {
          await tx.subscriptionFeatureModule.update({
            where: { id: existing.id },
            data: { status: 'PENDING_REMOVE' },
          });
        } else if (existing.status === 'PENDING_ADD' && !desired) {
          await tx.subscriptionFeatureModule.delete({
            where: { id: existing.id },
          });
          existingByModuleId.delete(existing.moduleId);
        } else if (existing.status === 'PENDING_REMOVE' && desired) {
          await tx.subscriptionFeatureModule.update({
            where: { id: existing.id },
            data: { status: 'ACTIVE' },
          });
        }
      }

      for (const moduleId of desiredModuleIds) {
        if (existingByModuleId.has(moduleId)) continue;
        await tx.subscriptionFeatureModule.create({
          data: {
            subscriptionId,
            tenantId,
            moduleId,
            status: 'PENDING_ADD',
          },
        });
      }

      await tx.subscriptionHistory.create({
        data: {
          subscriptionId,
          tenantId,
          eventType: 'subscription.modules.change-scheduled',
          actorUserId,
          actorType: 'TENANT_USER',
          metadata: {
            moduleIds: [...desiredModuleIds],
            effectiveAt: 'NEXT_RENEWAL',
          },
        },
      });

      return tx.subscriptionFeatureModule.findMany({
        where: { subscriptionId, tenantId },
        include: { featureModule: true },
        orderBy: { featureModule: { name: 'asc' } },
      });
    });
  }

  async applyPendingSubscriptionModules(
    subscriptionId: string,
    tenantId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const additions = await tx.subscriptionFeatureModule.updateMany({
        where: { subscriptionId, tenantId, status: 'PENDING_ADD' },
        data: { status: 'ACTIVE' },
      });
      const removals = await tx.subscriptionFeatureModule.deleteMany({
        where: { subscriptionId, tenantId, status: 'PENDING_REMOVE' },
      });
      return { added: additions.count, removed: removals.count };
    });
  }

  async getRecurringPriceCents(
    subscriptionId: string,
    tenantId: string,
    planId: string,
    planPriceCents: number,
  ) {
    const [included, selected] = await Promise.all([
      this.prisma.planFeatureModule.findMany({
        where: { planId },
        select: { moduleId: true },
      }),
      this.prisma.subscriptionFeatureModule.findMany({
        where: { subscriptionId, tenantId, status: 'ACTIVE' },
        include: { featureModule: { select: { monthlyPriceCents: true } } },
      }),
    ]);
    const includedIds = new Set(included.map((item) => item.moduleId));
    const addOnPriceCents = selected.reduce(
      (total, item) =>
        total +
        (includedIds.has(item.moduleId)
          ? 0
          : item.featureModule.monthlyPriceCents),
      0,
    );
    return planPriceCents + addOnPriceCents;
  }
}
