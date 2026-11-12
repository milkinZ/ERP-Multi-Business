import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import {
  KitchenTicketAggregate,
  KitchenTicketItem,
} from './domain/kitchen-ticket.aggregate';
import { KitchenStatus } from './domain/kitchen-status.enum';
import {
  BusinessType,
  OrderMode,
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
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
        KitchenStation: true;
        RecipeSnapshot: {
          include: {
            Items: true;
          };
        };
      };
    };
    KitchenAssignedUser: {
      select: {
        id: true;
        email: true;
      };
    };
  };
}>;

function normalizeCategories(categories: string[]) {
  const normalized = categories.map((category) =>
    category.trim().toLocaleLowerCase('en-US'),
  );
  if (normalized.some((category) => !category)) {
    throw new BadRequestException('Station categories must not be empty');
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new BadRequestException('Station categories must be unique');
  }
  return normalized;
}

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
    await this.assertCafeTenant(this.prisma, tenantId);
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
        ...(query.stationId
          ? {
              SalesOrderItem: {
                some: { kitchenStationId: query.stationId },
              },
            }
          : {}),
      },
      include: {
        SalesOrderItem: {
          include: {
            Product: true,
            KitchenStation: true,
            RecipeSnapshot: { include: { Items: true } },
          },
        },
        KitchenAssignedUser: { select: { id: true, email: true } },
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

    return orders.map((o) => this.toAggregate(o, query.stationId));
  }

  async findBySalesOrderId(
    id: string,
    tenantId: string,
    outletId: string | null = null,
  ): Promise<KitchenTicketAggregate | null> {
    await this.assertCafeTenant(this.prisma, tenantId);
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
            KitchenStation: true,
            RecipeSnapshot: { include: { Items: true } },
          },
        },
        KitchenAssignedUser: { select: { id: true, email: true } },
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
    await this.assertCafeTenant(this.prisma, tenantId);
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
            KitchenStation: true,
            RecipeSnapshot: { include: { Items: true } },
          },
        },
        KitchenAssignedUser: { select: { id: true, email: true } },
        Tenant: {
          select: { kitchenWaitThresholdMinutes: true },
        },
      },
    });

    return order ? this.toAggregate(order) : null;
  }

  async enqueueTicket(data: {
    id: string;
    tenantId: string;
    outletId: string | null;
    userId: string;
  }): Promise<KitchenTicketAggregate | null> {
    await this.prisma.$transaction(async (tx) => {
      await this.assertCafeTenant(tx, data.tenantId);
      const [order] = await tx.$queryRaw<
        Array<{
          id: string;
          orderNumber: string;
          outletId: string | null;
          kitchenReleasedAt: Date | null;
          status: OrderStatus;
          orderMode: OrderMode;
          paymentStatus: PaymentStatus;
        }>
      >`
        SELECT "id", "orderNumber", "outletId", "kitchenReleasedAt",
          "status", "orderMode", "paymentStatus"
        FROM "SalesOrder"
        WHERE "id" = ${data.id}
          AND "tenantId" = ${data.tenantId}
          AND (${data.outletId}::text IS NULL OR "outletId" = ${data.outletId})
        FOR UPDATE
      `;
      if (!order) throw new NotFoundException('Kitchen ticket not found');
      if (order.kitchenReleasedAt) {
        throw new ConflictException('Kitchen ticket has already been enqueued');
      }
      if (order.status !== OrderStatus.PENDING) {
        throw new BadRequestException(
          'Only pending orders can be enqueued to the Kitchen',
        );
      }
      if (
        order.orderMode !== OrderMode.OPEN_BILL &&
        order.paymentStatus !== PaymentStatus.PAID
      ) {
        throw new BadRequestException(
          'Order must be paid or an open bill before it can be enqueued',
        );
      }

      const items = await tx.salesOrderItem.findMany({
        where: { orderId: data.id },
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
      const routes = order.outletId
        ? await tx.kitchenStationCategory.findMany({
            where: {
              tenantId: data.tenantId,
              outletId: order.outletId,
              Station: { isActive: true },
            },
            select: { category: true, stationId: true },
          })
        : [];
      const stationByCategory = new Map(
        routes.map((route) => [route.category, route.stationId]),
      );
      for (const item of items) {
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

      await tx.salesOrder.update({
        where: { id: data.id },
        data: { kitchenReleasedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId,
          outletId: order.outletId,
          entity: 'SalesOrder',
          entityId: data.id,
          action: 'KITCHEN_TICKET_ENQUEUED',
          metadata: {
            orderNumber: order.orderNumber,
            itemCount: items.length,
          },
        },
      });
    });

    return this.findBySalesOrderId(data.id, data.tenantId, data.outletId);
  }

  async findStations(
    tenantId: string,
    actorOutletId: string | null,
    requestedOutletId?: string,
  ) {
    await this.assertCafeTenant(this.prisma, tenantId);
    if (
      actorOutletId &&
      requestedOutletId &&
      actorOutletId !== requestedOutletId
    ) {
      throw new NotFoundException('Kitchen station not found');
    }
    const outletId = actorOutletId ?? requestedOutletId;
    return this.prisma.kitchenStation.findMany({
      where: {
        tenantId,
        ...(outletId ? { outletId } : {}),
      },
      include: { Categories: { orderBy: { category: 'asc' } } },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
  }

  async findOutlets(tenantId: string, outletId: string | null) {
    await this.assertCafeTenant(this.prisma, tenantId);
    return this.prisma.outlet.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(outletId ? { id: outletId } : {}),
      },
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async createStation(data: {
    tenantId: string;
    userId: string;
    outletId: string;
    actorOutletId: string | null;
    name: string;
    categories: string[];
    displayOrder: number;
  }) {
    if (data.actorOutletId && data.actorOutletId !== data.outletId) {
      throw new NotFoundException('Outlet not found');
    }
    const categories = normalizeCategories(data.categories);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertCafeTenant(tx, data.tenantId);
        const outlet = await tx.outlet.findFirst({
          where: {
            id: data.outletId,
            tenantId: data.tenantId,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!outlet) throw new NotFoundException('Outlet not found');
        const station = await tx.kitchenStation.create({
          data: {
            tenantId: data.tenantId,
            outletId: data.outletId,
            name: data.name.trim(),
            displayOrder: data.displayOrder,
            Categories: {
              create: categories.map((category) => ({
                tenantId: data.tenantId,
                outletId: data.outletId,
                category,
              })),
            },
          },
          include: { Categories: { orderBy: { category: 'asc' } } },
        });
        await tx.auditLog.create({
          data: {
            tenantId: data.tenantId,
            userId: data.userId,
            outletId: data.outletId,
            entity: 'KitchenStation',
            entityId: station.id,
            action: 'KITCHEN_STATION_CREATED',
            metadata: {
              name: station.name,
              categories,
              displayOrder: station.displayOrder,
            },
          },
        });
        return station;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A station name or category is already configured for this outlet',
        );
      }
      throw error;
    }
  }

  async updateStation(data: {
    id: string;
    tenantId: string;
    userId: string;
    actorOutletId: string | null;
    name?: string;
    categories?: string[];
    isActive?: boolean;
    displayOrder?: number;
  }) {
    const categories =
      data.categories === undefined
        ? undefined
        : normalizeCategories(data.categories);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertCafeTenant(tx, data.tenantId);
        const [station] = await tx.$queryRaw<
          Array<{
            id: string;
            outletId: string;
            name: string;
            displayOrder: number;
            isActive: boolean;
          }>
        >`
          SELECT "id", "outletId", "name", "displayOrder", "isActive"
          FROM "KitchenStation"
          WHERE "id" = ${data.id}
            AND "tenantId" = ${data.tenantId}
            AND (${data.actorOutletId}::text IS NULL OR "outletId" = ${data.actorOutletId})
          FOR UPDATE
        `;
        if (!station) throw new NotFoundException('Kitchen station not found');
        if (categories) {
          const collision = await tx.kitchenStationCategory.findFirst({
            where: {
              tenantId: data.tenantId,
              outletId: station.outletId,
              category: { in: categories },
              stationId: { not: station.id },
            },
            select: { category: true },
          });
          if (collision) {
            throw new ConflictException(
              `Category "${collision.category}" is already routed to another station`,
            );
          }
          await tx.kitchenStationCategory.deleteMany({
            where: { tenantId: data.tenantId, stationId: station.id },
          });
          if (categories.length) {
            await tx.kitchenStationCategory.createMany({
              data: categories.map((category) => ({
                tenantId: data.tenantId,
                outletId: station.outletId,
                stationId: station.id,
                category,
              })),
            });
          }
        }

        const updated = await tx.kitchenStation.update({
          where: { id: station.id },
          data: {
            ...(data.name !== undefined ? { name: data.name.trim() } : {}),
            ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
            ...(data.displayOrder !== undefined
              ? { displayOrder: data.displayOrder }
              : {}),
          },
          include: { Categories: { orderBy: { category: 'asc' } } },
        });
        await tx.auditLog.create({
          data: {
            tenantId: data.tenantId,
            userId: data.userId,
            outletId: station.outletId,
            entity: 'KitchenStation',
            entityId: station.id,
            action: 'KITCHEN_STATION_UPDATED',
            metadata: {
              previousName: station.name,
              name: updated.name,
              categories: updated.Categories.map(
                (category) => category.category,
              ),
              isActive: updated.isActive,
              displayOrder: updated.displayOrder,
            },
          },
        });
        return updated;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A station name or category is already configured for this outlet',
        );
      }
      throw error;
    }
  }

  async findKitchenOperators(tenantId: string, outletId: string | null) {
    await this.assertCafeTenant(this.prisma, tenantId);
    return this.prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
        deletedAt: null,
        UserRole: {
          some: {
            tenantId,
            deletedAt: null,
            role: {
              RolePermission: {
                some: { Permission: { code: 'kitchen.update' } },
              },
            },
          },
        },
        ...(outletId
          ? {
              UserOutlet: {
                some: { tenantId, outletId, deletedAt: null },
              },
            }
          : {}),
      },
      select: { id: true, email: true },
      orderBy: [{ email: 'asc' }, { id: 'asc' }],
    });
  }

  async getAnalytics(data: {
    tenantId: string;
    outletId: string | null;
    stationId: string | null;
    startAt: Date;
    endAtExclusive: Date;
  }) {
    await this.assertCafeTenant(this.prisma, data.tenantId);
    if (data.stationId) {
      const station = await this.prisma.kitchenStation.findFirst({
        where: {
          id: data.stationId,
          tenantId: data.tenantId,
          ...(data.outletId ? { outletId: data.outletId } : {}),
        },
        select: { id: true },
      });
      if (!station) throw new NotFoundException('Kitchen station not found');
    }

    const [totalTickets, stations] = await Promise.all([
      this.prisma.salesOrder.count({
        where: {
          tenantId: data.tenantId,
          kitchenReleasedAt: {
            gte: data.startAt,
            lt: data.endAtExclusive,
          },
          ...(data.outletId ? { outletId: data.outletId } : {}),
        },
      }),
      this.prisma.$queryRaw<
        Array<{
          stationId: string | null;
          stationName: string;
          ticketCount: bigint;
          averageWaitSeconds: number | null;
          averageCookSeconds: number | null;
          onTimeItems: bigint;
          timedItems: bigint;
        }>
      >`
        SELECT
          station."id" AS "stationId",
          COALESCE(station."name", 'Unassigned') AS "stationName",
          COUNT(DISTINCT sales_order."id")::bigint AS "ticketCount",
          AVG(EXTRACT(EPOCH FROM (
            sales_order."kitchenStartedAt" - sales_order."kitchenReleasedAt"
          ))) AS "averageWaitSeconds",
          AVG(EXTRACT(EPOCH FROM (
            sales_order."kitchenReadyAt" - sales_order."kitchenStartedAt"
          ))) AS "averageCookSeconds",
          COUNT(*) FILTER (
            WHERE order_item."kitchenPrepTimeMinutes" IS NOT NULL
              AND order_item."kitchenCompletedAt" IS NOT NULL
              AND order_item."kitchenStartedAt" IS NOT NULL
              AND EXTRACT(EPOCH FROM (
                order_item."kitchenCompletedAt" - order_item."kitchenStartedAt"
              )) <= order_item."kitchenPrepTimeMinutes" * 60
          )::bigint AS "onTimeItems",
          COUNT(*) FILTER (
            WHERE order_item."kitchenPrepTimeMinutes" IS NOT NULL
              AND order_item."kitchenCompletedAt" IS NOT NULL
              AND order_item."kitchenStartedAt" IS NOT NULL
          )::bigint AS "timedItems"
        FROM "SalesOrder" AS sales_order
        JOIN "SalesOrderItem" AS order_item
          ON order_item."orderId" = sales_order."id"
        LEFT JOIN "KitchenStation" AS station
          ON station."id" = order_item."kitchenStationId"
        WHERE sales_order."tenantId" = ${data.tenantId}
          AND sales_order."kitchenReleasedAt" >= ${data.startAt}
          AND sales_order."kitchenReleasedAt" < ${data.endAtExclusive}
          AND (${data.outletId}::text IS NULL OR sales_order."outletId" = ${data.outletId})
          AND (${data.stationId}::text IS NULL OR order_item."kitchenStationId" = ${data.stationId})
        GROUP BY station."id", station."name"
        ORDER BY "stationName" ASC
      `,
    ]);

    return {
      totalTickets,
      startAt: data.startAt,
      endAt: new Date(data.endAtExclusive.getTime() - 1),
      stations: stations.map((station) => ({
        stationId: station.stationId,
        stationName: station.stationName,
        ticketCount: Number(station.ticketCount),
        averageWaitSeconds:
          station.averageWaitSeconds === null
            ? null
            : Math.round(station.averageWaitSeconds),
        averageCookSeconds:
          station.averageCookSeconds === null
            ? null
            : Math.round(station.averageCookSeconds),
        onTimeItems: Number(station.onTimeItems),
        timedItems: Number(station.timedItems),
        slaPercent:
          Number(station.timedItems) === 0
            ? null
            : Math.round(
                (Number(station.onTimeItems) / Number(station.timedItems)) *
                  100,
              ),
      })),
    };
  }

  async assignTicket(data: {
    id: string;
    tenantId: string;
    userId: string;
    assignedUserId: string | null;
    outletId: string | null;
  }) {
    await this.prisma.$transaction(async (tx) => {
      await this.assertCafeTenant(tx, data.tenantId);
      const [order] = await tx.$queryRaw<
        Array<{
          id: string;
          outletId: string | null;
          kitchenAssignedUserId: string | null;
        }>
      >`
        SELECT "id", "outletId", "kitchenAssignedUserId"
        FROM "SalesOrder"
        WHERE "id" = ${data.id}
          AND "tenantId" = ${data.tenantId}
          AND (${data.outletId}::text IS NULL OR "outletId" = ${data.outletId})
          AND "kitchenReleasedAt" IS NOT NULL
          AND "status" IN ('PENDING', 'IN_PROGRESS', 'READY')
        FOR UPDATE
      `;
      if (!order) throw new NotFoundException('Kitchen ticket not found');

      if (data.assignedUserId) {
        const operator = await tx.user.findFirst({
          where: {
            id: data.assignedUserId,
            tenantId: data.tenantId,
            isActive: true,
            deletedAt: null,
            UserRole: {
              some: {
                tenantId: data.tenantId,
                deletedAt: null,
                role: {
                  RolePermission: {
                    some: { Permission: { code: 'kitchen.update' } },
                  },
                },
              },
            },
            ...(order.outletId
              ? {
                  UserOutlet: {
                    some: {
                      tenantId: data.tenantId,
                      outletId: order.outletId,
                      deletedAt: null,
                    },
                  },
                }
              : {}),
          },
          select: { id: true },
        });
        if (!operator) {
          throw new BadRequestException(
            'Assignee must be an active Kitchen operator assigned to this outlet',
          );
        }
      }

      if (order.kitchenAssignedUserId === data.assignedUserId) return;
      await tx.salesOrder.update({
        where: { id: order.id },
        data: { kitchenAssignedUserId: data.assignedUserId },
      });
      await tx.auditLog.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId,
          outletId: order.outletId,
          entity: 'SalesOrder',
          entityId: data.id,
          action: 'KITCHEN_TICKET_ASSIGNED',
          metadata: {
            previousAssigneeId: order.kitchenAssignedUserId,
            assigneeId: data.assignedUserId,
          },
        },
      });
    });
    return this.findBySalesOrderId(data.id, data.tenantId, data.outletId);
  }

  async updatePriority(
    id: string,
    tenantId: string,
    priority: number,
    userId: string,
    outletId: string | null = null,
  ): Promise<KitchenTicketAggregate | null> {
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.assertCafeTenant(tx, tenantId);
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

    return updated ? this.findBySalesOrderId(id, tenantId, outletId) : null;
  }

  async getSettings(tenantId: string) {
    await this.assertCafeTenant(this.prisma, tenantId);
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
      await this.assertCafeTenant(tx, tenantId);
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
    releaseReservation:
      | ((tx: Prisma.TransactionClient) => Promise<unknown>)
      | undefined,
    outletId: string | null,
    actor: { userId: string; reason?: string },
  ): Promise<KitchenTicketAggregate | null> {
    const dbStatus = this.mapKitchenStatusToOrderStatus(status);
    const expectedDbStatus = this.mapKitchenStatusToOrderStatus(expectedStatus);

    const persisted = await this.prisma.$transaction(async (tx) => {
      await this.assertCafeTenant(tx, tenantId);
      const [order] = await tx.$queryRaw<
        Array<{
          status: OrderStatus;
          outletId: string | null;
          kitchenStartedAt: Date | null;
          kitchenReadyAt: Date | null;
        }>
      >`
        SELECT "status", "outletId", "kitchenStartedAt", "kitchenReadyAt"
        FROM "SalesOrder"
        WHERE "id" = ${id}
          AND "tenantId" = ${tenantId}
          AND (${outletId}::text IS NULL OR "outletId" = ${outletId})
          AND "kitchenReleasedAt" IS NOT NULL
        FOR UPDATE
      `;
      if (!order || order.status !== expectedDbStatus) return false;

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

      const now = new Date();
      if (status === KitchenStatus.COOKING) {
        if (!order.kitchenStartedAt) {
          await tx.salesOrder.update({
            where: { id },
            data: { kitchenStartedAt: now },
          });
        }
        await tx.salesOrderItem.updateMany({
          where: { orderId: id, kitchenStartedAt: null },
          data: { kitchenStartedAt: now },
        });
      } else if (status === KitchenStatus.READY) {
        if (!order.kitchenReadyAt) {
          await tx.salesOrder.update({
            where: { id },
            data: { kitchenReadyAt: now },
          });
        }
        await tx.salesOrderItem.updateMany({
          where: {
            orderId: id,
            kitchenStartedAt: { not: null },
            kitchenCompletedAt: null,
          },
          data: { kitchenCompletedAt: now },
        });
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

      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actor.userId,
          outletId: order.outletId,
          entity: 'SalesOrder',
          entityId: id,
          action: 'KITCHEN_STATUS_CHANGED',
          metadata: {
            fromStatus: expectedStatus,
            toStatus: status,
            ...(actor.reason ? { reason: actor.reason } : {}),
          },
        },
      });

      return true;
    });

    return persisted
      ? this.findTicketBySalesOrderId(id, tenantId, outletId)
      : null;
  }

  private toAggregate(
    order: OrderWithItems,
    stationId?: string,
  ): KitchenTicketAggregate {
    const items: KitchenTicketItem[] = order.SalesOrderItem.filter(
      (item) => !stationId || item.kitchenStationId === stationId,
    ).map((item) => ({
      productId: item.Product.id,
      productName: item.Product.name,
      category: item.kitchenCategorySnapshot,
      quantity: item.quantity,
      stationId: item.kitchenStationId,
      stationName: item.KitchenStation?.name ?? null,
      prepTimeMinutes: item.kitchenPrepTimeMinutes,
      startedAt: item.kitchenStartedAt,
      completedAt: item.kitchenCompletedAt,
      recipeSnapshotAvailable: item.RecipeSnapshot !== null,
      ingredients:
        item.RecipeSnapshot?.Items.map((ingredient) => ({
          inventoryItemId: ingredient.inventoryItemId,
          name: ingredient.ingredientName,
          unit: ingredient.unit,
          quantity: ingredient.quantity,
        })) ?? [],
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
      assignedUser: order.KitchenAssignedUser,
      releasedAt: order.kitchenReleasedAt,
      startedAt: order.kitchenStartedAt,
      readyAt: order.kitchenReadyAt,
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

  private async assertCafeTenant(
    client: PrismaService | Prisma.TransactionClient,
    tenantId: string,
  ) {
    const tenant = await client.tenant.findUnique({
      where: { id: tenantId },
      select: { businessType: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (tenant.businessType !== BusinessType.CAFE) {
      throw new ForbiddenException('Kitchen is available to CAFE tenants only');
    }
  }
}
