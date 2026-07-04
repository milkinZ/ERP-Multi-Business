import { Injectable } from '@nestjs/common';
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
      items,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const persisted = await this.prisma.purchaseOrder.create({
      data: {
        poNumber: aggregate.poNumber,
        status: aggregate.status,
        supplierId: aggregate.supplierId,
        tenantId: aggregate.tenantId,
        warehouseId: aggregate.warehouseId ?? undefined,
        expectedDeliveryDate: aggregate.expectedDeliveryDate,
        totalAmount: aggregate.totalAmount,
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
      skip?: number;
      take?: number;
    },
  ) {
    const where: Prisma.PurchaseOrderWhereInput = {
      tenantId,
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.supplierId ? { supplierId: filters.supplierId } : {}),
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
        orderBy: { createdAt: 'desc' },
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
