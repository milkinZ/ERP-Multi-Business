import { Injectable } from '@nestjs/common';
import { Prisma, TenantStatus } from '@prisma/client';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';
import type {
  InvoiceExportCursor,
  InvoiceExportRow,
} from '../billing/invoice-export';
export type SuperAdminTenantQueryOptions = {
  page?: number;
  limit?: number;
  search?: string;
  includeDeactivated?: boolean;
};

/**
 * Super Admin Repository
 *
 * Note: this repository is GLOBAL (cross-tenant). It deliberately does NOT use
 * buildTenantFilter/buildOutletFilter so it can operate across all tenants.
 * Cross-tenant access is authorized ONLY at the controller/guard layer via
 * SUPER_ADMIN_* permissions.
 */
@Injectable()
export class SuperAdminRepository extends BaseRepository {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async findTenantById(tenantId: string) {
    return this.prisma.tenant.findFirst({
      where: { id: tenantId },
    });
  }

  async findAllTenants(
    options?: SuperAdminTenantQueryOptions,
  ): Promise<{ data: unknown[]; total: number }> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.TenantWhereInput = {};

    if (!options?.includeDeactivated) {
      where.deletedAt = null;
    }

    if (options?.search) {
      where.OR = [
        { name: { contains: options.search, mode: 'insensitive' } },
        { contactEmail: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    const [records, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return { data: records, total };
  }

  async findAllPlans() {
    return this.prisma.plan.findMany({
      where: { deletedAt: null },
      include: {
        modules: {
          include: { featureModule: true },
          orderBy: { featureModule: { name: 'asc' } },
        },
      },
      orderBy: { priceCents: 'asc' },
    });
  }

  async findPlanById(id: string) {
    return this.prisma.plan.findFirst({
      where: { id, deletedAt: null },
      include: {
        modules: {
          include: { featureModule: true },
          orderBy: { featureModule: { name: 'asc' } },
        },
      },
    });
  }

  async findPlanByType(type: string) {
    return this.prisma.plan.findFirst({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      where: { type: type as any, deletedAt: null },
    });
  }

  async createPlan(
    data: {
      type: string;
      name: string;
      priceCents: number;
      maxOutlets?: number | null;
      maxUsers?: number | null;
      maxMonthlyOrders?: number | null;
      moduleIds?: string[];
    },
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return client.plan.create({
      data: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        type: data.type as any,
        name: data.name,
        priceCents: data.priceCents,
        maxOutlets: data.maxOutlets,
        maxUsers: data.maxUsers,
        maxMonthlyOrders: data.maxMonthlyOrders,
        modules: {
          create: (data.moduleIds ?? []).map((moduleId) => ({
            featureModule: { connect: { id: moduleId } },
          })),
        },
      },
      include: {
        modules: { include: { featureModule: true } },
      },
    });
  }

  async updatePlan(
    id: string,
    data: {
      name?: string;
      priceCents?: number;
      maxOutlets?: number | null;
      maxUsers?: number | null;
      maxMonthlyOrders?: number | null;
      moduleIds?: string[];
    },
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const update = async (tx: Prisma.TransactionClient | PrismaService) => {
      const { moduleIds, ...planData } = data;
      if (moduleIds !== undefined) {
        await tx.planFeatureModule.deleteMany({ where: { planId: id } });
        if (moduleIds.length) {
          await tx.planFeatureModule.createMany({
            data: moduleIds.map((moduleId) => ({ planId: id, moduleId })),
          });
        }
      }
      return tx.plan.update({
        where: { id },
        data: planData,
        include: {
          modules: { include: { featureModule: true } },
        },
      });
    };
    return client === this.prisma
      ? this.prisma.$transaction((tx) => update(tx))
      : update(client);
  }

  async findAllFeatureModules(includeInactive = true) {
    return this.prisma.featureModule.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async findFeatureModulesByIds(ids: string[]) {
    if (!ids.length) return [];
    return this.prisma.featureModule.findMany({
      where: { id: { in: ids }, isActive: true },
    });
  }

  async findFeatureModulesByKeys(keys: string[]) {
    if (!keys.length) return [];
    return this.prisma.featureModule.findMany({
      where: { key: { in: keys }, isActive: true },
    });
  }

  async softDeletePlan(
    id: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return client.plan.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async findSubscriptionByTenantId(tenantId: string) {
    return this.prisma.subscription.findFirst({
      where: { tenantId, deletedAt: null },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllSubscriptions() {
    return this.prisma.subscription.findMany({
      where: { deletedAt: null },
      include: { plan: true, tenant: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findSubscriptionById(id: string) {
    return this.prisma.subscription.findFirst({
      where: { id, deletedAt: null },
      include: { plan: true, tenant: true },
    });
  }

  async findAllInvoices(
    where: Prisma.InvoiceWhereInput,
    page: number,
    limit: number,
  ) {
    const filter: Prisma.InvoiceWhereInput = {
      AND: [{ deletedAt: null }, where],
    };
    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where: filter,
        include: { tenant: { select: { id: true, name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invoice.count({ where: filter }),
    ]);
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findInvoiceExportPage(
    where: Prisma.InvoiceWhereInput,
    cursor: InvoiceExportCursor | undefined,
    take: number,
  ): Promise<InvoiceExportRow[]> {
    const pageWhere: Prisma.InvoiceWhereInput = {
      AND: [
        where,
        ...(cursor
          ? [
              {
                OR: [
                  { createdAt: { gt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                ],
              },
            ]
          : []),
      ],
    };
    const records = await this.prisma.invoice.findMany({
      where: pageWhere,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take,
      include: { tenant: { select: { name: true } } },
    });
    return records.map((record) => ({
      ...record,
      tenantName: record.tenant.name,
    }));
  }

  async getBillingAggregate() {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.prisma.$transaction(
      async (tx) => {
        const [
          tenantGroups,
          userCount,
          outletCount,
          platformAuditCount,
          recentPlatformAuditCount,
          subscriptionStatusGroups,
          subscriptionPlanGroups,
          invoiceGroups,
          invoiceProviderStatusGroups,
          paymentRequestGroups,
        ] = await Promise.all([
          tx.tenant.groupBy({
            by: ['status'],
            _count: { _all: true },
            orderBy: { status: 'asc' },
          }),
          tx.user.count({ where: { deletedAt: null } }),
          tx.outlet.count({ where: { deletedAt: null } }),
          tx.platformAuditLog.count(),
          tx.platformAuditLog.count({
            where: { createdAt: { gte: last24Hours } },
          }),
          tx.subscription.groupBy({
            by: ['status'],
            where: { deletedAt: null },
            _count: { _all: true },
            orderBy: { status: 'asc' },
          }),
          tx.subscription.groupBy({
            by: ['planId'],
            where: { deletedAt: null },
            _count: { _all: true },
            orderBy: { planId: 'asc' },
          }),
          tx.invoice.groupBy({
            by: ['status', 'currency'],
            where: { deletedAt: null },
            _count: { _all: true },
            _sum: { amountCents: true },
            orderBy: [{ status: 'asc' }, { currency: 'asc' }],
          }),
          tx.invoice.groupBy({
            by: ['providerStatus'],
            where: { deletedAt: null },
            _count: { _all: true },
            orderBy: { providerStatus: 'asc' },
          }),
          tx.xenditPaymentRequestAttempt.groupBy({
            by: ['state'],
            where: { invoice: { is: { deletedAt: null } } },
            _count: { _all: true },
            orderBy: { state: 'asc' },
          }),
        ]);

        const plans =
          subscriptionPlanGroups.length === 0
            ? []
            : await tx.plan.findMany({
                where: {
                  id: {
                    in: subscriptionPlanGroups.map((group) => group.planId),
                  },
                },
                select: { id: true, type: true, name: true },
              });
        const plansById = new Map(plans.map((plan) => [plan.id, plan]));

        const byPlan = subscriptionPlanGroups.map((group) => {
          const plan = plansById.get(group.planId);
          if (!plan) {
            throw new Error(
              `Subscription references missing plan ${group.planId}`,
            );
          }
          return {
            planId: plan.id,
            planType: plan.type,
            planName: plan.name,
            subscriptionCount: group._count._all,
          };
        });

        return {
          tenants: {
            total: tenantGroups.reduce(
              (total, group) => total + group._count._all,
              0,
            ),
            byStatus: tenantGroups.map(({ status, _count }) => ({
              status,
              count: _count._all,
            })),
          },
          users: { total: userCount },
          outlets: { total: outletCount },
          platformAudit: {
            total: platformAuditCount,
            last24Hours: recentPlatformAuditCount,
          },
          subscriptions: {
            total: subscriptionStatusGroups.reduce(
              (total, group) => total + group._count._all,
              0,
            ),
            byStatus: subscriptionStatusGroups.map(({ status, _count }) => ({
              status,
              count: _count._all,
            })),
            byPlan,
          },
          invoices: {
            total: invoiceGroups.reduce(
              (total, group) => total + group._count._all,
              0,
            ),
            byStatusAndCurrency: invoiceGroups.map(
              ({ status, currency, _count, _sum }) => ({
                status,
                currency,
                count: _count._all,
                amountCents: _sum.amountCents ?? 0,
              }),
            ),
            byProviderStatus: invoiceProviderStatusGroups.map(
              ({ providerStatus, _count }) => ({
                providerStatus,
                count: _count._all,
              }),
            ),
          },
          paymentRequests: {
            total: paymentRequestGroups.reduce(
              (total, group) => total + group._count._all,
              0,
            ),
            byState: paymentRequestGroups.map(({ state, _count }) => ({
              state,
              count: _count._all,
            })),
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async findInvoiceById(id: string) {
    return this.prisma.invoice.findFirst({
      where: { id, deletedAt: null },
      include: { tenant: true },
    });
  }

  async findAllFeatureFlags() {
    return this.prisma.featureFlag.findMany({
      where: { deletedAt: null },
      include: { tenant: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateTenantDeletedAt(tenantId: string, deletedAt: Date | null) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        deletedAt,
        status:
          deletedAt === null ? TenantStatus.ACTIVE : TenantStatus.DEACTIVATED,
      },
    });
  }
}
