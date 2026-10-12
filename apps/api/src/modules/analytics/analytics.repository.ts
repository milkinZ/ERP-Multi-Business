import { Injectable } from '@nestjs/common';

import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';
import type { AnalyticsQueryDto } from './dto/analytics-query.dto';

export interface RevenueAggregation {
  totalRevenue: number;
  paidOrderCount: number;
  completedOrderCount: number;
  cancelledOrderCount: number;
  pendingOrderCount: number;
  totalOrderCount: number;
  totalPaymentCount: number;
  averageOrderValue: number;
}

export interface TopProductRow {
  productId: string;
  name: string;
  qtySold: number;
}

@Injectable()
export class AnalyticsRepository extends BaseRepository {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  private async resolveOrderIds(
    tenantId: string,
    query?: AnalyticsQueryDto,
    status?: 'PENDING' | 'PAID' | 'COMPLETED' | 'CANCELLED',
  ): Promise<string[]> {
    const dateFilter = this.buildDateFilter(query?.startDate, query?.endDate);

    const where: Record<string, unknown> = { tenantId, ...dateFilter };

    if (status) {
      where.status = status;
    }

    if (query?.outletId) {
      where.outletId = query.outletId;
    }

    const rows = await this.prisma.salesOrder.findMany({
      where,
      select: { id: true },
    });

    return rows.map((row) => row.id);
  }

  /**
   * Aggregates revenue/order metrics within a tenant (and optional outlet/date range).
   * Uses database-side aggregation — no full-table loads.
   */
  async aggregateRevenue(
    tenantId: string,
    query?: AnalyticsQueryDto,
  ): Promise<RevenueAggregation> {
    const dateFilter = this.buildDateFilter(query?.startDate, query?.endDate);
    const outletFilter = query?.outletId ? { outletId: query.outletId } : {};

    const baseWhere = {
      tenantId,
      ...outletFilter,
    };

    const scopedOrderIds = query?.outletId
      ? await this.resolveOrderIds(tenantId, query, 'PAID')
      : [];

    const paymentWhere: Record<string, unknown> = {
      tenantId,
      status: 'PAID',
      ...dateFilter,
    };

    if (query?.outletId) {
      paymentWhere.orderId =
        scopedOrderIds.length > 0
          ? { in: scopedOrderIds }
          : { in: ['__none__'] };
    }

    const [
      totalOrders,
      paidOrders,
      completedOrders,
      cancelledOrders,
      pendingOrders,
      revenueAgg,
      paymentCount,
    ] = await Promise.all([
      // Total orders
      this.prisma.salesOrder.count({
        where: { ...baseWhere, ...dateFilter },
      }),

      // Paid orders
      this.prisma.salesOrder.count({
        where: { ...baseWhere, ...dateFilter, status: 'PAID' },
      }),

      // Completed orders
      this.prisma.salesOrder.count({
        where: { ...baseWhere, ...dateFilter, status: 'COMPLETED' },
      }),

      // Cancelled orders
      this.prisma.salesOrder.count({
        where: { ...baseWhere, ...dateFilter, status: 'CANCELLED' },
      }),

      // Pending orders
      this.prisma.salesOrder.count({
        where: { ...baseWhere, ...dateFilter, status: 'PENDING' },
      }),

      // Revenue from PAID payments (source of truth for financials)
      this.prisma.payment.aggregate({
        where: paymentWhere,
        _sum: { amount: true },
        _count: true,
      }),

      // Count all payments (regardless of status)
      this.prisma.payment.count({
        where: {
          tenantId,
          ...dateFilter,
          ...(query?.outletId
            ? {
                orderId:
                  scopedOrderIds.length > 0
                    ? { in: scopedOrderIds }
                    : { in: ['__none__'] },
              }
            : {}),
        },
      }),
    ]);

    const totalRevenue = revenueAgg._sum.amount ?? 0;
    const paidOrderCount = paidOrders;
    const averageOrderValue =
      paidOrderCount > 0 ? Math.round(totalRevenue / paidOrderCount) : 0;

    return {
      totalRevenue,
      paidOrderCount,
      completedOrderCount: completedOrders,
      cancelledOrderCount: cancelledOrders,
      pendingOrderCount: pendingOrders,
      totalOrderCount: totalOrders,
      totalPaymentCount: paymentCount,
      averageOrderValue,
    };
  }

  /**
   * Retrieves top products by quantity sold.
   * Uses database-side aggregation (groupBy) to avoid loading all rows into Node.js.
   */
  async getTopProducts(
    tenantId: string,
    query?: AnalyticsQueryDto,
    limit = 10,
  ): Promise<TopProductRow[]> {
    const orderIds = await this.resolveOrderIds(tenantId, query, 'COMPLETED');

    const rows = await this.prisma.salesOrderItem.groupBy({
      by: ['productId'],
      where: {
        orderId: orderIds.length > 0 ? { in: orderIds } : { in: ['__none__'] },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });

    if (rows.length === 0) return [];

    const productIds = rows.map((r) => r.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, tenantId },
      select: { id: true, name: true },
    });

    const productMap = new Map(products.map((p) => [p.id, p.name]));

    return rows.map((row) => ({
      productId: row.productId,
      name: productMap.get(row.productId) ?? 'Unknown',
      qtySold: row._sum.quantity ?? 0,
    }));
  }

  async getProductCount(
    tenantId: string,
    query?: AnalyticsQueryDto,
  ): Promise<number> {
    const dateFilter = query?.startDate
      ? { createdAt: { gte: new Date(query.startDate) } }
      : {};
    const outletFilter = query?.outletId ? { outletId: query.outletId } : {};

    return this.prisma.product.count({
      where: { tenantId, ...outletFilter, ...dateFilter },
    });
  }

  private buildDateFilter(
    startDate?: string,
    endDate?: string,
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = {};
    if (startDate) {
      filter.gte = new Date(startDate);
    }
    if (endDate) {
      filter.lte = new Date(endDate);
    }
    return Object.keys(filter).length > 0 ? { createdAt: filter } : {};
  }
}
