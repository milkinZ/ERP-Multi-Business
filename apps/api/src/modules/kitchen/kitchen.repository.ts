import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import {
  KitchenTicketAggregate,
  KitchenTicketItem,
} from './domain/kitchen-ticket.aggregate';
import { KitchenStatus } from './domain/kitchen-status.enum';
import { Prisma, OrderStatus } from '@prisma/client';

type OrderWithItems = Prisma.SalesOrderGetPayload<{
  include: {
    SalesOrderItem: {
      include: {
        Product: true;
      };
    };
  };
}>;

@Injectable()
export class KitchenRepository extends BaseRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findManyByTenant(tenantId: string): Promise<KitchenTicketAggregate[]> {
    const orders = await this.prisma.salesOrder.findMany({
      where: { tenantId },
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

    return orders.map((o) => this.toAggregate(o));
  }

  async findBySalesOrderId(
    id: string,
    tenantId: string,
  ): Promise<KitchenTicketAggregate | null> {
    const order = await this.prisma.salesOrder.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        SalesOrderItem: {
          include: {
            Product: true,
          },
        },
      },
    });

    return order ? this.toAggregate(order) : null;
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: KitchenStatus,
  ): Promise<KitchenTicketAggregate | null> {
    const dbStatus = this.mapKitchenStatusToOrderStatus(status);

    const updated = await this.prisma.salesOrder.update({
      where: {
        id,
        tenantId,
      },
      data: {
        status: dbStatus,
      },
    });

    if (!updated) {
      return null;
    }

    return this.findBySalesOrderId(id, tenantId);
  }

  private toAggregate(order: OrderWithItems): KitchenTicketAggregate {
    const items: KitchenTicketItem[] = order.SalesOrderItem.map((item) => ({
      productId: item.Product.id,
      productName: item.Product.name,
      quantity: item.quantity,
    }));

    const kitchenStatus = this.mapOrderStatusToKitchenStatus(order.status);

    return KitchenTicketAggregate.fromPersistence({
      id: order.id,
      ticketNumber: order.orderNumber,
      salesOrderId: order.id,
      tenantId: order.tenantId,
      outletId: order.outletId,
      items,
      status: kitchenStatus,
      priority: 0,
      createdById: null,
      createdAt: order.createdAt,
      updatedAt: order.createdAt,
    });
  }

  private mapKitchenStatusToOrderStatus(status: KitchenStatus): OrderStatus {
    const map: Record<KitchenStatus, OrderStatus> = {
      [KitchenStatus.NEW]: OrderStatus.PENDING,
      [KitchenStatus.QUEUED]: OrderStatus.PENDING,
      [KitchenStatus.COOKING]: OrderStatus.IN_PROGRESS,
      [KitchenStatus.READY]: OrderStatus.READY,
      [KitchenStatus.SERVED]: OrderStatus.COMPLETED,
      [KitchenStatus.CANCELLED]: OrderStatus.CANCELLED,
      [KitchenStatus.RECALLED]: OrderStatus.PENDING,
    };

    return map[status];
  }

  private mapOrderStatusToKitchenStatus(
    orderStatus: OrderStatus,
  ): KitchenStatus {
    const map: Partial<Record<OrderStatus, KitchenStatus>> = {
      [OrderStatus.PENDING]: KitchenStatus.NEW,
      [OrderStatus.IN_PROGRESS]: KitchenStatus.COOKING,
      [OrderStatus.READY]: KitchenStatus.READY,
      [OrderStatus.COMPLETED]: KitchenStatus.SERVED,
      [OrderStatus.CANCELLED]: KitchenStatus.CANCELLED,
    };

    return map[orderStatus] ?? KitchenStatus.NEW;
  }
}
