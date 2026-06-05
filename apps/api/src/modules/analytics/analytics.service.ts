import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getSummary(tenantId: string) {
    const [totalProducts, totalOrders, totalPayments, revenue] =
      await Promise.all([
        this.prisma.product.count({
          where: {
            tenantId,
          },
        }),

        this.prisma.customerOrder.count({
          where: {
            tenantId,
          },
        }),

        this.prisma.payment.count({
          where: {
            tenantId,
          },
        }),

        this.prisma.payment.aggregate({
          where: {
            tenantId,
            status: 'PAID',
          },

          _sum: {
            amount: true,
          },
        }),
      ]);

    return {
      totalProducts,
      totalOrders,
      totalPayments,

      totalRevenue: revenue._sum.amount ?? 0,
    };
  }

  async getTopProducts(tenantId: string) {
    const orders = await this.prisma.customerOrder.findMany({
      where: {
        tenantId,
        status: 'PAID',
      },

      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    const map = new Map<
      string,
      {
        productId: string;
        name: string;
        qtySold: number;
      }
    >();

    for (const order of orders) {
      for (const item of order.items) {
        const existing = map.get(item.productId);

        if (existing) {
          existing.qtySold += item.quantity;
        } else {
          map.set(item.productId, {
            productId: item.productId,

            name: item.product.name,

            qtySold: item.quantity,
          });
        }
      }
    }

    return Array.from(map.values())
      .sort((a, b) => b.qtySold - a.qtySold)
      .slice(0, 10);
  }
}
