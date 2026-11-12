import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../core/database/prisma.service';
import { PlanType } from '../domain/subscription.aggregate';
import { getPlanCatalogEntry } from './plan-catalog';

export type PlanEntitlements = {
  planType: PlanType;
  maxOutlets: number | null;
  maxUsers: number | null;
  maxMonthlyOrders: number | null;
  featureModuleKeys: string[];
};

type EntitlementClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class PlanEntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async getForTenant(
    tenantId: string,
    client: EntitlementClient = this.prisma,
  ): Promise<PlanEntitlements> {
    const subscription = await client.subscription.findFirst({
      where: { tenantId, deletedAt: null },
      include: {
        plan: {
          include: {
            modules: {
              where: { featureModule: { isActive: true } },
              include: { featureModule: { select: { key: true } } },
            },
          },
        },
        modules: {
          where: {
            status: 'ACTIVE',
            featureModule: { isActive: true },
          },
          include: { featureModule: { select: { key: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const planType = (subscription?.plan.type ?? PlanType.FREE) as PlanType;
    const defaults = getPlanCatalogEntry(planType);
    if (!subscription) {
      return {
        planType,
        maxOutlets: defaults.maxOutlets,
        maxUsers: defaults.maxUsers,
        maxMonthlyOrders: defaults.maxMonthlyOrders,
        featureModuleKeys: [],
      };
    }

    const featureModuleKeys = new Set([
      ...subscription.plan.modules.map((item) => item.featureModule.key),
      ...subscription.modules.map((item) => item.featureModule.key),
    ]);
    return {
      planType,
      maxOutlets: subscription.plan.maxOutlets,
      maxUsers: subscription.plan.maxUsers,
      maxMonthlyOrders: subscription.plan.maxMonthlyOrders,
      featureModuleKeys: [...featureModuleKeys],
    };
  }

  async getFeatureModuleEntitlement(
    tenantId: string,
    key: string,
  ): Promise<boolean | null> {
    const featureModule = await this.prisma.featureModule.findUnique({
      where: { key },
      select: { id: true, isActive: true },
    });
    if (!featureModule) return null;
    if (!featureModule.isActive) return false;

    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId, deletedAt: null },
      select: {
        id: true,
        plan: {
          select: {
            modules: {
              where: { moduleId: featureModule.id },
              select: { moduleId: true },
            },
          },
        },
        modules: {
          where: {
            moduleId: featureModule.id,
            status: 'ACTIVE',
          },
          select: { id: true },
        },
      },
    });
    return Boolean(
      subscription &&
      (subscription.plan.modules.length > 0 || subscription.modules.length > 0),
    );
  }

  async getUsage(tenantId: string) {
    const now = new Date();
    const periodKey = now.toISOString().slice(0, 7);
    const [
      entitlements,
      activeOutlets,
      activeUsers,
      pendingInvitations,
      usage,
    ] = await Promise.all([
      this.getForTenant(tenantId),
      this.prisma.outlet.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.user.count({
        where: { tenantId, deletedAt: null, isActive: true },
      }),
      this.prisma.userInvitation.count({
        where: {
          tenantId,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
      }),
      this.prisma.subscriptionMonthlyUsage.findUnique({
        where: { tenantId_periodKey: { tenantId, periodKey } },
        select: { orderCount: true, overLimitOrderCount: true },
      }),
    ]);
    const usersUsed = activeUsers + pendingInvitations;
    const monthlyOrders = usage?.orderCount ?? 0;

    return {
      planType: entitlements.planType,
      periodKey,
      limits: {
        outlets: entitlements.maxOutlets,
        users: entitlements.maxUsers,
        monthlyOrders: entitlements.maxMonthlyOrders,
      },
      usage: {
        outlets: activeOutlets,
        activeUsers,
        pendingInvitations,
        users: usersUsed,
        monthlyOrders,
        overLimitOrders: usage?.overLimitOrderCount ?? 0,
      },
      warnings: {
        outlets:
          entitlements.maxOutlets !== null &&
          activeOutlets >= entitlements.maxOutlets,
        users:
          entitlements.maxUsers !== null && usersUsed >= entitlements.maxUsers,
        monthlyOrders:
          entitlements.maxMonthlyOrders !== null &&
          monthlyOrders >= entitlements.maxMonthlyOrders,
        orderOverage:
          entitlements.maxMonthlyOrders !== null &&
          monthlyOrders > entitlements.maxMonthlyOrders,
      },
    };
  }

  async assertCanCreateOutlet(
    tenantId: string,
    client: EntitlementClient = this.prisma,
  ): Promise<void> {
    const [entitlements, activeOutlets] = await Promise.all([
      this.getForTenant(tenantId, client),
      client.outlet.count({ where: { tenantId, deletedAt: null } }),
    ]);
    if (
      entitlements.maxOutlets !== null &&
      activeOutlets >= entitlements.maxOutlets
    ) {
      throw new ConflictException(
        `The ${entitlements.planType} plan allows up to ${entitlements.maxOutlets} active outlets`,
      );
    }
  }

  async assertCanCreateUser(
    tenantId: string,
    client: EntitlementClient = this.prisma,
    includeInvitations = true,
  ): Promise<void> {
    const entitlements = await this.getForTenant(tenantId, client);
    if (entitlements.maxUsers === null) return;

    const now = new Date();
    const [activeUsers, pendingInvitations] = await Promise.all([
      client.user.count({
        where: { tenantId, deletedAt: null, isActive: true },
      }),
      includeInvitations
        ? client.userInvitation.count({
            where: {
              tenantId,
              acceptedAt: null,
              revokedAt: null,
              expiresAt: { gt: now },
            },
          })
        : Promise.resolve(0),
    ]);

    if (activeUsers + pendingInvitations >= entitlements.maxUsers) {
      throw new ConflictException(
        `The ${entitlements.planType} plan allows up to ${entitlements.maxUsers} active users, including pending invitations`,
      );
    }
  }
}
