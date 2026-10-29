import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';
import {
  PurchaseOrderAggregate,
  PurchaseOrderProps,
} from './domain/purchase-order.aggregate';
import { Prisma, PurchaseOrderStatus } from '@prisma/client';

@Injectable()
export class PurchaseOrderRepository extends BaseRepository {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async createPurchaseOrder(data: {
    tenantId: string;
    poNumber: string;
    supplierId: string;
    warehouseId?: string | null;
    expectedDeliveryDate?: Date | null;
    notes?: string | null;
    items: {
      inventoryItemId: string;
      quantity: number;
      unitPrice: number;
    }[];
  }) {
    const items = data.items.map((item) => ({
      ...item,
      subtotal: item.quantity * item.unitPrice,
    }));

    const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);

    const aggregate = PurchaseOrderAggregate.create({
      id: `PO-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      poNumber: data.poNumber,
      status: PurchaseOrderStatus.DRAFT,
      supplierId: data.supplierId,
      tenantId: data.tenantId,
      warehouseId: data.warehouseId ?? null,
      expectedDeliveryDate: data.expectedDeliveryDate ?? null,
      totalAmount,
      notes: data.notes ?? null,
      receivedAt: null,
      completedAt: null,
      items: items.map((i) => ({
        ...i,
        receivedQuantity: 0,
      })),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const persisted = await this.prisma.$transaction(async (tx) => {
      const tenants = await tx.$queryRaw<
        Array<{ currencyCode: string | null }>
      >`
        SELECT "currencyCode"
        FROM "Tenant"
        WHERE "id" = ${aggregate.tenantId} AND "deletedAt" IS NULL
        FOR SHARE
      `;
      const currencyCode = tenants[0]?.currencyCode?.trim();
      if (!currencyCode) {
        throw new BadRequestException(
          'Configure the tenant base currency before creating financial transactions',
        );
      }

      return tx.purchaseOrder.create({
        data: {
          poNumber: aggregate.poNumber,
          status: aggregate.status,
          supplierId: aggregate.supplierId,
          tenantId: aggregate.tenantId,
          warehouseId: aggregate.warehouseId ?? undefined,
          expectedDeliveryDate: aggregate.expectedDeliveryDate,
          totalAmount: aggregate.totalAmount,
          currencyCode,
          notes: aggregate.notes,
          updatedAt: new Date(),
          PurchaseOrderItem: {
            create: aggregate.items.map((item) => ({
              inventoryItemId: item.inventoryItemId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              subtotal: item.subtotal,
            })),
          },
        },
        include: {
          PurchaseOrderItem: true,
        },
      });
    });

    return PurchaseOrderAggregate.fromPersistence({
      ...persisted,
      PurchaseOrderItem: persisted.PurchaseOrderItem,
    });
  }

  async findAll(
    tenantId: string,
    filters?: {
      status?: PurchaseOrderStatus;
      supplierId?: string;
      search?: string;
      fromDate?: Date;
      toDate?: Date;
      sortBy?:
        | 'createdAt'
        | 'expectedDeliveryDate'
        | 'totalAmount'
        | 'poNumber';
      sortOrder?: 'asc' | 'desc';
      skip?: number;
      take?: number;
    },
  ) {
    const toDateExclusive = filters?.toDate
      ? new Date(filters.toDate.getTime() + 24 * 60 * 60 * 1000)
      : undefined;
    const where: Prisma.PurchaseOrderWhereInput = {
      tenantId,
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.supplierId ? { supplierId: filters.supplierId } : {}),
      AND: [
        { Supplier: { is: { tenantId } } },
        ...(filters?.search
          ? [
              {
                OR: [
                  {
                    poNumber: {
                      contains: filters.search.trim(),
                      mode: 'insensitive' as const,
                    },
                  },
                  {
                    Supplier: {
                      is: {
                        tenantId,
                        OR: [
                          {
                            name: {
                              contains: filters.search.trim(),
                              mode: 'insensitive' as const,
                            },
                          },
                          {
                            email: {
                              contains: filters.search.trim(),
                              mode: 'insensitive' as const,
                            },
                          },
                        ],
                      },
                    },
                  },
                ],
              },
            ]
          : []),
      ],
      ...(filters?.fromDate || toDateExclusive
        ? {
            createdAt: {
              ...(filters?.fromDate ? { gte: filters.fromDate } : {}),
              ...(toDateExclusive ? { lt: toDateExclusive } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        include: {
          PurchaseOrderItem: true,
          Supplier: true,
          Warehouse: true,
        },
        skip: filters?.skip,
        take: filters?.take,
        orderBy: [
          { [filters?.sortBy ?? 'createdAt']: filters?.sortOrder ?? 'desc' },
          { id: filters?.sortOrder ?? 'desc' },
        ],
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return { data, total };
  }

  async findOne(id: string, tenantId: string) {
    const purchaseOrder = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
      include: {
        PurchaseOrderItem: true,
        Supplier: true,
        Warehouse: true,
      },
    });

    return purchaseOrder;
  }

  async updateReceivedQuantitiesAndStatus(params: {
    id: string;
    tenantId: string;
    nextStatus: PurchaseOrderStatus;
    receivedAt?: Date | null;
    receivedQuantityByItem: Record<string, number>; // inventoryItemId -> cumulative receivedQuantity
    // applies only deltas; idempotency enforced by receivedQuantity values
  }) {
    const { id, tenantId, nextStatus, receivedAt, receivedQuantityByItem } =
      params;

    return this.prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findFirst({
        where: { id, tenantId },
        include: { PurchaseOrderItem: true },
      });

      if (!po) return null;

      // Apply updates per item in a deterministic order.
      for (const poi of po.PurchaseOrderItem) {
        const inventoryItemId = poi.inventoryItemId;
        const nextReceived = receivedQuantityByItem[inventoryItemId];

        if (nextReceived === undefined) {
          continue;
        }

        if (nextReceived < poi.receivedQuantity) {
          throw new Error('Cannot decrease already received quantity');
        }

        // Idempotent update: if same value, no-op
        if (nextReceived === poi.receivedQuantity) continue;

        await tx.purchaseOrderItem.update({
          where: { id: poi.id },
          data: { receivedQuantity: nextReceived },
        });
      }

      const updated = await tx.purchaseOrder.updateMany({
        where: { id, tenantId },
        data: {
          status: nextStatus,
          receivedAt: receivedAt ?? undefined,
          updatedAt: new Date(),
        },
      });

      if (updated.count !== 1) {
        return null;
      }

      return tx.purchaseOrder.findFirst({
        where: { id, tenantId },
        include: {
          PurchaseOrderItem: true,
          Supplier: true,
          Warehouse: true,
        },
      });
    });
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<PurchaseOrderProps>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.updateMany({
        where: { id, tenantId },
        data: {
          supplierId: data.supplierId,
          warehouseId:
            data.warehouseId === null ? null : (data.warehouseId ?? undefined),
          expectedDeliveryDate:
            data.expectedDeliveryDate === null
              ? null
              : (data.expectedDeliveryDate ?? undefined),
          totalAmount: data.totalAmount,
          notes: data.notes === null ? null : (data.notes ?? undefined),
          updatedAt: new Date(),
        },
      });

      if (updated.count !== 1) {
        return null;
      }

      if (data.items) {
        await tx.purchaseOrderItem.deleteMany({
          where: { purchaseOrderId: id },
        });

        await tx.purchaseOrderItem.createMany({
          data: data.items.map((item) => ({
            purchaseOrderId: id,
            inventoryItemId: item.inventoryItemId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
          })),
        });
      }

      return tx.purchaseOrder.findFirst({
        where: { id, tenantId },
        include: {
          PurchaseOrderItem: true,
          Supplier: true,
          Warehouse: true,
        },
      });
    });
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: PurchaseOrderStatus,
  ) {
    const updated = await this.prisma.purchaseOrder.updateMany({
      where: { id, tenantId },
      data: {
        status,
        updatedAt: new Date(),
        receivedAt:
          status === PurchaseOrderStatus.RECEIVED ? new Date() : undefined,
        completedAt:
          status === PurchaseOrderStatus.COMPLETED ? new Date() : undefined,
      },
    });

    if (updated.count !== 1) {
      return null;
    }

    return this.findOne(id, tenantId);
  }

  async delete(id: string, tenantId: string) {
    const result = await this.prisma.purchaseOrder.deleteMany({
      where: { id, tenantId },
    });

    return result.count === 1;
  }
}
