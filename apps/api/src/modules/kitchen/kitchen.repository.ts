import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import {
  KitchenTicketAggregate,
  KitchenTicketItem,
} from './domain/kitchen-ticket.aggregate';
import { KitchenStatus } from './domain/kitchen-status.enum';
import { Prisma, OrderStatus } from '@prisma/client';
import { InventoryCostingService } from '../inventory/inventory-costing.service';
import { ListKitchenTicketsDto } from './dto/list-kitchen-tickets.dto';

type OrderWithItems = Prisma.SalesOrderGetPayload<{
  include: {
    Tenant: {
      select: {
        kitchenWaitThresholdMinutes: true;
      };
    };
    SalesOrderItem: {
      include: {
        Product: true;
      };
    };
  };
}>;

@Injectable()
export class KitchenRepository extends BaseRepository {
  constructor(
    prisma: PrismaService,
    private readonly costing: InventoryCostingService,
  ) {
    super(prisma);
  }

  async findManyByTenant(
    tenantId: string,
    outletId: string | null,
    query: ListKitchenTicketsDto,
  ): Promise<KitchenTicketAggregate[]> {
    const status = query.status
      ? {
          [KitchenStatus.QUEUED]: OrderStatus.PENDING,
          [KitchenStatus.COOKING]: OrderStatus.IN_PROGRESS,
          [KitchenStatus.READY]: OrderStatus.READY,
        }[query.status]
      : undefined;
    const search = query.search?.trim();
    const orders = await this.prisma.salesOrder.findMany({
      where: {
        tenantId,
        ...(outletId ? { outletId } : {}),
        kitchenReleasedAt: { not: null },
        ...(status
          ? { status }
          : {
              status: {
                in: [
                  OrderStatus.PENDING,
                  OrderStatus.IN_PROGRESS,
                  OrderStatus.READY,
                ],
              },
            }),
        ...(search
          ? {
              OR: [
                { orderNumber: { contains: search, mode: 'insensitive' } },
                { id: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        SalesOrderItem: {
          include: {
            Product: true,
          },
        },
        Tenant: {
          select: { kitchenWaitThresholdMinutes: true },
        },
      },
      orderBy: [
        { kitchenPriority: 'desc' },
        { kitchenReleasedAt: 'asc' },
        { id: 'asc' },
      ],
      ...(query.take !== undefined
        ? {
            skip: query.skip ?? 0,
            take: query.take,
          }
        : {}),
    });

    return orders.map((o) => this.toAggregate(o));
  }

  async findBySalesOrderId(
    id: string,
    tenantId: string,
    outletId: string | null = null,
  ): Promise<KitchenTicketAggregate | null> {
    const order = await this.prisma.salesOrder.findFirst({
      where: {
        id,
        tenantId,
        ...(outletId ? { outletId } : {}),
        kitchenReleasedAt: { not: null },
        status: {
          in: [OrderStatus.PENDING, OrderStatus.IN_PROGRESS, OrderStatus.READY],
        },
      },
      include: {
        SalesOrderItem: {
          include: {
            Product: true,
          },
        },
        Tenant: {
          select: { kitchenWaitThresholdMinutes: true },
        },
      },
    });

    return order ? this.toAggregate(order) : null;
  }

  async findTicketBySalesOrderId(
    id: string,
    tenantId: string,
    outletId: string | null = null,
  ): Promise<KitchenTicketAggregate | null> {
    const order = await this.prisma.salesOrder.findFirst({
      where: {
        id,
        tenantId,
        ...(outletId ? { outletId } : {}),
        kitchenReleasedAt: { not: null },
        status: {
          in: [
            OrderStatus.PENDING,
            OrderStatus.IN_PROGRESS,
            OrderStatus.READY,
            OrderStatus.COMPLETED,
            OrderStatus.CANCELLED,
          ],
        },
      },
      include: {
        SalesOrderItem: {
          include: {
            Product: true,
          },
        },
        Tenant: {
          select: { kitchenWaitThresholdMinutes: true },
        },
      },
    });

    return order ? this.toAggregate(order) : null;
  }

  async updatePriority(
    id: string,
    tenantId: string,
    priority: number,
    userId: string,
    outletId: string | null = null,
  ): Promise<KitchenTicketAggregate | null> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const [order] = await tx.$queryRaw<
        Array<{ id: string; kitchenPriority: number; outletId: string | null }>
      >`
        SELECT "id", "kitchenPriority", "outletId"
        FROM "SalesOrder"
        WHERE "id" = ${id}
          AND "tenantId" = ${tenantId}
          AND (${outletId}::text IS NULL OR "outletId" = ${outletId})
          AND "kitchenReleasedAt" IS NOT NULL
          AND "status" IN ('PENDING', 'IN_PROGRESS', 'READY')
        FOR UPDATE
      `;
      if (!order) return false;

      if (order.kitchenPriority !== priority) {
        await tx.salesOrder.update({
          where: { id },
          data: { kitchenPriority: priority },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            outletId: order.outletId,
            entity: 'SalesOrder',
            entityId: id,
            action: 'KITCHEN_PRIORITY_UPDATED',
            metadata: {
              previousPriority: order.kitchenPriority,
              priority,
            },
          },
        });
      }
      return true;
    });

    return updated ? this.findBySalesOrderId(id, tenantId) : null;
  }

  async getSettings(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { kitchenWaitThresholdMinutes: true },
    });
    return tenant
      ? { waitThresholdMinutes: tenant.kitchenWaitThresholdMinutes }
      : null;
  }

  async updateWaitThreshold(
    tenantId: string,
    waitThresholdMinutes: number,
    userId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const [tenant] = await tx.$queryRaw<
        Array<{ id: string; kitchenWaitThresholdMinutes: number }>
      >`
        SELECT "id", "kitchenWaitThresholdMinutes"
        FROM "Tenant"
        WHERE "id" = ${tenantId}
        FOR UPDATE
      `;
      if (!tenant) return null;

      if (tenant.kitchenWaitThresholdMinutes !== waitThresholdMinutes) {
        await tx.tenant.update({
          where: { id: tenantId },
          data: { kitchenWaitThresholdMinutes: waitThresholdMinutes },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            entity: 'Tenant',
            entityId: tenantId,
            action: 'KITCHEN_WAIT_THRESHOLD_UPDATED',
            metadata: {
              previousWaitThresholdMinutes: tenant.kitchenWaitThresholdMinutes,
              waitThresholdMinutes,
            },
          },
        });
      }
      return { waitThresholdMinutes };
    });
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: KitchenStatus,
    expectedStatus: KitchenStatus,
    releaseReservation?: (tx: Prisma.TransactionClient) => Promise<unknown>,
    outletId: string | null = null,
  ): Promise<KitchenTicketAggregate | null> {
    const dbStatus = this.mapKitchenStatusToOrderStatus(status);
    const expectedDbStatus = this.mapKitchenStatusToOrderStatus(expectedStatus);

    const persisted = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.salesOrder.updateMany({
        where: {
          id,
          tenantId,
          ...(outletId ? { outletId } : {}),
          status: expectedDbStatus,
          kitchenReleasedAt: { not: null },
        },
        data: { status: dbStatus },
      });

      if (updated.count !== 1) {
        return false;
      }

      if (status === KitchenStatus.CANCELLED) {
        await releaseReservation?.(tx);
      }

      if (status === KitchenStatus.COOKING) {
        const reservations = await tx.inventoryMovement.findMany({
          where: {
            tenantId,
            referenceId: id,
            referenceType: 'ORDER_RESERVATION',
          },
          select: { id: true },
        });

        if (reservations.length > 0) {
          const committed = await tx.inventoryMovement.updateMany({
            where: {
              id: { in: reservations.map((reservation) => reservation.id) },
              tenantId,
              referenceType: 'ORDER_RESERVATION',
            },
            data: {
              referenceType: 'ORDER_RESERVATION_COMMITTED',
              type: 'CONSUMPTION',
              note: 'Committed cafe stock reservation when kitchen preparation started',
            },
          });

          if (committed.count !== reservations.length) {
            throw new ConflictException(
              'Kitchen inventory reservation changed concurrently',
            );
          }
          for (const reservation of reservations) {
            const allocations = await tx.inventoryMovementCostAllocation.count({
              where: { movementId: reservation.id },
            });
            if (allocations === 0) {
              const movement = await tx.inventoryMovement.findUnique({
                where: { id: reservation.id },
              });
              if (!movement) {
                throw new ConflictException(
                  'Kitchen inventory reservation no longer exists',
                );
              }
              await this.costing.issue(tx, {
                tenantId,
                inventoryItemId: movement.inventoryItemId,
                warehouseId: movement.warehouseId,
                quantity: movement.quantity,
                movementId: movement.id,
              });
            }
          }
        }
      }

      return true;
    });

    return persisted ? this.findBySalesOrderId(id, tenantId) : null;
  }

  private toAggregate(order: OrderWithItems): KitchenTicketAggregate {
    const items: KitchenTicketItem[] = order.SalesOrderItem.map((item) => ({
      productId: item.Product.id,
      productName: item.Product.name,
      quantity: item.quantity,
    }));

    const kitchenStatus = this.mapOrderStatusToKitchenStatus(order.status);
    const waitingTooLong =
      kitchenStatus === KitchenStatus.QUEUED &&
      order.kitchenReleasedAt !== null &&
      Date.now() - order.kitchenReleasedAt.getTime() >=
        order.Tenant.kitchenWaitThresholdMinutes * 60_000;

    return KitchenTicketAggregate.fromPersistence({
      id: order.id,
      ticketNumber: order.orderNumber,
      salesOrderId: order.id,
      tenantId: order.tenantId,
      outletId: order.outletId,
      items,
      status: kitchenStatus,
      priority: order.kitchenPriority,
      waitingTooLong,
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
      [OrderStatus.PENDING]: KitchenStatus.QUEUED,
      [OrderStatus.IN_PROGRESS]: KitchenStatus.COOKING,
      [OrderStatus.READY]: KitchenStatus.READY,
      [OrderStatus.COMPLETED]: KitchenStatus.SERVED,
      [OrderStatus.CANCELLED]: KitchenStatus.CANCELLED,
    };

    return map[orderStatus] ?? KitchenStatus.NEW;
  }
}
