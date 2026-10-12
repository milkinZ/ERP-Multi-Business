import { Injectable } from '@nestjs/common';
import { Prisma, TenantStatus } from '@prisma/client';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';
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
      orderBy: { priceCents: 'asc' },
    });
  }

  async findPlanById(id: string) {
    return this.prisma.plan.findFirst({
      where: { id, deletedAt: null },
    });
  }

  async findPlanByType(type: string) {
    return this.prisma.plan.findFirst({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      where: { type: type as any, deletedAt: null },
    });
  }

  async createPlan(data: { type: string; name: string; priceCents: number }) {
    return this.prisma.plan.create({
      data: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        type: data.type as any,
        name: data.name,
        priceCents: data.priceCents,
      },
    });
  }

  async updatePlan(id: string, data: { name?: string; priceCents?: number }) {
    return this.prisma.plan.update({
      where: { id },
      data,
    });
  }

  async softDeletePlan(id: string) {
    return this.prisma.plan.update({
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

  async findAllInvoices() {
    return this.prisma.invoice.findMany({
      where: { deletedAt: null },
      include: { tenant: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getBillingAggregate() {
    return this.prisma.$transaction(
      async (tx) => {
        const [
          tenantGroups,
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
