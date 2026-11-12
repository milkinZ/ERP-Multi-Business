import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';
import {
  OrderItemDetails,
  OrderAggregate,
  SalesOrderWithItems,
} from './domain/order.aggregate';
import { OrderMode, OrderStatus, Prisma } from '@prisma/client';
import { PlanEntitlementsService } from '../subscription/plans/plan-entitlements.service';

@Injectable()
export class OrdersRepository extends BaseRepository {
  constructor(
    protected readonly prisma: PrismaService,
    private readonly planEntitlements: PlanEntitlementsService,
  ) {
    super(prisma);
  }

  async createOrder(
    tenantId: string,
    outletId: string | null,
    orderNumber: string,
    totalAmount: number,
    items: OrderItemDetails[],
    orderMode: OrderMode = OrderMode.REGULAR,
  ): Promise<
    SalesOrderWithItems & {
      planUsage: {
        periodKey: string;
        ordersUsed: number;
        monthlyOrderLimit: number | null;
        limitReached: boolean;
        overLimit: boolean;
      };
    }
  > {
    const created = await this.prisma.$transaction(async (tx) => {
      const tenants = await tx.$queryRaw<
        Array<{ currencyCode: string | null }>
      >`
        SELECT "currencyCode"
        FROM "Tenant"
        WHERE "id" = ${tenantId} AND "deletedAt" IS NULL
        FOR SHARE
      `;
      const currencyCode = tenants[0]?.currencyCode?.trim();
      if (!currencyCode) {
        throw new BadRequestException(
          'Configure the tenant base currency before creating financial transactions',
        );
      }

      const periodKey = new Date().toISOString().slice(0, 7);
      const usageRecord = await tx.subscriptionMonthlyUsage.upsert({
        where: { tenantId_periodKey: { tenantId, periodKey } },
        create: { tenantId, periodKey, orderCount: 1 },
        update: { orderCount: { increment: 1 } },
        select: { orderCount: true },
      });
      const entitlements = await this.planEntitlements.getForTenant(
        tenantId,
        tx,
      );
      const overLimit =
        entitlements.maxMonthlyOrders !== null &&
        usageRecord.orderCount > entitlements.maxMonthlyOrders;
      if (overLimit) {
        throw new ConflictException(
          `The ${entitlements.planType} plan allows up to ${entitlements.maxMonthlyOrders} orders per month`,
        );
      }

      const order = await tx.salesOrder.create({
        data: {
          orderNumber,
          status: OrderStatus.PENDING,
          orderMode,
          tenantId,
          outletId,
          totalAmount,
          currencyCode,
        },
      });

      await tx.salesOrderItem.createMany({
        data: items.map((item) => ({
          orderId: order.id,
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
          subtotal: item.subtotal,
        })),
      });

      const createdOrder = await tx.salesOrder.findUnique({
        where: { id: order.id },
        include: {
          SalesOrderItem: {
            include: {
              Product: true,
            },
          },
        },
      });
      if (!createdOrder) return null;

      return {
        ...createdOrder,
        planUsage: {
          periodKey,
          ordersUsed: usageRecord.orderCount,
          monthlyOrderLimit: entitlements.maxMonthlyOrders,
          limitReached:
            entitlements.maxMonthlyOrders !== null &&
            usageRecord.orderCount >= entitlements.maxMonthlyOrders,
          overLimit,
        },
      };
    });

    if (!created) {
      throw new Error('Failed to create order');
    }

    return created;
  }

  async findAll(
    tenantId: string,
    outletId?: string | null,
  ): Promise<SalesOrderWithItems[]> {
    return this.prisma.salesOrder.findMany({
      where: {
        tenantId,
        ...(outletId ? { outletId } : {}),
      },
      include: {
        SalesOrderItem: {
          include: {
            Product: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(
    id: string,
    tenantId: string,
    outletId?: string | null,
  ): Promise<SalesOrderWithItems | null> {
    return this.prisma.salesOrder.findFirst({
      where: {
        id,
        tenantId,
        ...(outletId ? { outletId } : {}),
      },
      include: {
        SalesOrderItem: {
          include: {
            Product: true,
          },
        },
      },
    });
  }

  async findTenantById(
    tenantId: string,
  ): Promise<Pick<import('@prisma/client').Tenant, 'businessType'> | null> {
    return this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { businessType: true },
    });
  }

  async findProductsByIds(
    ids: string[],
    tenantId: string,
  ): Promise<import('@prisma/client').Product[]> {
    return this.prisma.product.findMany({
      where: {
        id: { in: ids },
        tenantId,
      },
    });
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: OrderStatus,
  ): Promise<SalesOrderWithItems | null> {
    const updated = await this.prisma.salesOrder.updateMany({
      where: {
        id,
        tenantId,
      },
      data: {
        status,
      },
    });

    if (updated.count !== 1) {
      return null;
    }

    return this.findOne(id, tenantId);
  }

  async markPaid(
    id: string,
    tenantId: string,
  ): Promise<SalesOrderWithItems | null> {
    const updated = await this.prisma.salesOrder.updateMany({
      where: {
        id,
        tenantId,
        status: {
          in: [OrderStatus.PENDING, OrderStatus.IN_PROGRESS, OrderStatus.READY],
        },
      },
      data: {
        status: OrderStatus.PAID,
      },
    });

    if (updated.count !== 1) {
      return null;
    }

    return this.findOne(id, tenantId);
  }

  async releaseToKitchen(
    id: string,
    tenantId: string,
  ): Promise<SalesOrderWithItems | null> {
    await this.prisma.$transaction(async (tx) => {
      const [order] = await tx.$queryRaw<
        Array<{
          id: string;
          outletId: string | null;
          kitchenReleasedAt: Date | null;
          status: OrderStatus;
        }>
      >`
        SELECT "id", "outletId", "kitchenReleasedAt", "status"
        FROM "SalesOrder"
        WHERE "id" = ${id} AND "tenantId" = ${tenantId}
        FOR UPDATE
      `;
      if (!order || order.status === OrderStatus.CANCELLED) return;

      const canRelease = await tx.salesOrder.findFirst({
        where: {
          id,
          tenantId,
          OR: [{ orderMode: OrderMode.OPEN_BILL }, { paymentStatus: 'PAID' }],
        },
        select: { id: true },
      });
      if (!canRelease) return;

      if (!order.kitchenReleasedAt) {
        if (order.outletId) {
          const products = await tx.salesOrderItem.findMany({
            where: { orderId: id },
            select: {
              id: true,
              Product: {
                select: {
                  kitchenCategory: true,
                  kitchenPrepTimeMinutes: true,
                },
              },
            },
          });
          const routes = await tx.kitchenStationCategory.findMany({
            where: {
              tenantId,
              outletId: order.outletId,
              Station: { isActive: true },
            },
            select: { category: true, stationId: true },
          });
          const stationByCategory = new Map(
            routes.map((route) => [route.category, route.stationId]),
          );
          for (const item of products) {
            const category =
              item.Product.kitchenCategory?.trim().toLocaleLowerCase('en-US') ??
              null;
            await tx.salesOrderItem.update({
              where: { id: item.id },
              data: {
                kitchenCategorySnapshot: category,
                kitchenPrepTimeMinutes: item.Product.kitchenPrepTimeMinutes,
                kitchenStationId: category
                  ? (stationByCategory.get(category) ?? null)
                  : null,
              },
            });
          }
        }

        await tx.salesOrder.update({
          where: { id },
          data: { kitchenReleasedAt: new Date() },
        });
      }
    });

    return this.findOne(id, tenantId);
  }

  async cancelOrder(
    id: string,
    tenantId: string,
    outletId?: string | null,
    releaseReservation?: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ): Promise<SalesOrderWithItems | null> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.salesOrder.updateMany({
        where: {
          id,
          tenantId,
          status: { not: OrderStatus.COMPLETED },
          ...(outletId ? { outletId } : {}),
        },
        data: {
          status: OrderStatus.CANCELLED,
        },
      });

      if (updated.count !== 1) {
        return null;
      }

      await releaseReservation?.(tx);

      return tx.salesOrder.findFirst({
        where: {
          id,
          tenantId,
          ...(outletId ? { outletId } : {}),
        },
        include: {
          SalesOrderItem: {
            include: {
              Product: true,
            },
          },
        },
      });
    });
  }

  async markCompleted(
    id: string,
    tenantId: string,
  ): Promise<SalesOrderWithItems | null> {
    const updated = await this.prisma.salesOrder.updateMany({
      where: {
        id,
        tenantId,
        status: OrderStatus.PAID,
      },
      data: {
        status: OrderStatus.COMPLETED,
      },
    });

    if (updated.count !== 1) {
      return null;
    }

    return this.findOne(id, tenantId);
  }

  async findOneAggregate(
    id: string,
    tenantId: string,
    outletId?: string | null,
  ): Promise<OrderAggregate | null> {
    const order = await this.findOne(id, tenantId, outletId);
    if (!order) {
      return null;
    }
    return OrderAggregate.fromPersistence(order);
  }
}
