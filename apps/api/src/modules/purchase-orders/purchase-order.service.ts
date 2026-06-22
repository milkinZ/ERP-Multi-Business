import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryMovementType, PurchaseOrderStatus } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { BaseService } from '../../core/services/base.service';
import { CreatePurchaseOrderDto, UpdatePurchaseOrderDto } from './dto';

@Injectable()
export class PurchaseOrderService extends BaseService {
  constructor(protected prisma: PrismaService) {
    super(prisma);
  }

  async create(tenantId: string, userId: string, dto: CreatePurchaseOrderDto) {
    const { supplierId, warehouseId, expectedDeliveryDate, notes, items } = dto;

    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
    });

    if (!supplier || supplier.tenantId !== tenantId) {
      throw new NotFoundException('Supplier not found');
    }

    const inventoryItems = await this.prisma.inventoryItem.findMany({
      where: {
        id: { in: items.map((item) => item.inventoryItemId) },
        tenantId,
      },
    });

    if (inventoryItems.length !== items.length) {
      throw new BadRequestException('Some inventory items not found');
    }

    const totalAmount = items.reduce((sum, item) => {
      return sum + item.quantity * item.unitPrice;
    }, 0);

    const poNumber = await this.generatePoNumber(tenantId);

    return this.prisma.purchaseOrder.create({
      data: {
        poNumber,
        status: PurchaseOrderStatus.DRAFT,
        supplierId,
        tenantId,
        warehouseId: warehouseId ?? null,
        expectedDeliveryDate: expectedDeliveryDate
          ? new Date(expectedDeliveryDate)
          : null,
        totalAmount,
        notes: notes ?? null,
        updatedAt: new Date(),
        PurchaseOrderItem: {
          create: items.map((item) => ({
            inventoryItemId: item.inventoryItemId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.quantity * item.unitPrice,
          })),
        },
      },
      include: {
        PurchaseOrderItem: true,
        Supplier: true,
        Warehouse: true,
      },
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
    const { status, supplierId, skip, take } = filters || {};
    const { skip: paginationSkip, take: paginationTake } =
      this.getPaginationParams(skip, take);

    const where = {
      tenantId,
      ...(status ? { status } : {}),
      ...(supplierId ? { supplierId } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        include: {
          PurchaseOrderItem: true,
          Supplier: true,
          Warehouse: true,
        },
        skip: paginationSkip,
        take: paginationTake,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return this.formatPaginatedResponse(
      data,
      total,
      paginationSkip,
      paginationTake,
    );
  }

  async findOne(tenantId: string, id: string) {
    const purchaseOrder = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        PurchaseOrderItem: { include: { InventoryItem: true } },
        Supplier: true,
        Warehouse: true,
      },
    });

    if (!purchaseOrder || purchaseOrder.tenantId !== tenantId) {
      throw new NotFoundException('Purchase Order not found');
    }

    return purchaseOrder;
  }

  async update(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdatePurchaseOrderDto,
  ) {
    const po = await this.findOne(tenantId, id);

    const editableStatuses: PurchaseOrderStatus[] = [
      PurchaseOrderStatus.DRAFT,
      PurchaseOrderStatus.PENDING,
    ];

    if (!editableStatuses.includes(po.status)) {
      throw new BadRequestException(
        'Can only edit PO in DRAFT or PENDING status',
      );
    }

    const { supplierId, items, ...updateData } = dto;

    let totalAmount = po.totalAmount;

    if (items && items.length > 0) {
      await this.prisma.purchaseOrderItem.deleteMany({
        where: { purchaseOrderId: id },
      });

      totalAmount = items.reduce((sum: number, item) => {
        const quantity = item.quantity ?? 0;
        const unitPrice = item.unitPrice ?? 0;
        return sum + quantity * unitPrice;
      }, 0);
    }

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        ...updateData,
        supplierId: supplierId ?? undefined,
        totalAmount,
        updatedAt: new Date(),
        PurchaseOrderItem: items
          ? {
              create: items.map((item) => {
                const inventoryItemId = item.inventoryItemId;
                const quantity = item.quantity;
                const unitPrice = item.unitPrice;

                if (!inventoryItemId || quantity == null || unitPrice == null) {
                  throw new BadRequestException('Invalid purchase order item');
                }

                return {
                  inventoryItemId,
                  quantity,
                  unitPrice,
                  subtotal: quantity * unitPrice,
                };
              }),
            }
          : undefined,
      },
      include: {
        PurchaseOrderItem: true,
        Supplier: true,
        Warehouse: true,
      },
    });
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: PurchaseOrderStatus,
  ) {
    const po = await this.findOne(tenantId, id);

    const validTransitions: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> =
      {
        [PurchaseOrderStatus.DRAFT]: [
          PurchaseOrderStatus.PENDING,
          PurchaseOrderStatus.CANCELLED,
        ],
        [PurchaseOrderStatus.PENDING]: [
          PurchaseOrderStatus.APPROVED,
          PurchaseOrderStatus.REJECTED,
          PurchaseOrderStatus.CANCELLED,
        ],
        [PurchaseOrderStatus.APPROVED]: [
          PurchaseOrderStatus.PARTIALLY_RECEIVED,
          PurchaseOrderStatus.RECEIVED,
        ],
        [PurchaseOrderStatus.PARTIALLY_RECEIVED]: [
          PurchaseOrderStatus.RECEIVED,
        ],
        [PurchaseOrderStatus.RECEIVED]: [PurchaseOrderStatus.COMPLETED],
        [PurchaseOrderStatus.REJECTED]: [PurchaseOrderStatus.CANCELLED],
        [PurchaseOrderStatus.CANCELLED]: [],
        [PurchaseOrderStatus.COMPLETED]: [],
      };

    if (!validTransitions[po.status]?.includes(status)) {
      throw new BadRequestException(
        `Cannot transition from ${po.status} to ${status}`,
      );
    }

    const updateData: {
      status: PurchaseOrderStatus;
      updatedAt: Date;
      receivedAt?: Date;
      completedAt?: Date;
    } = { status, updatedAt: new Date() };

    if (status === PurchaseOrderStatus.RECEIVED) {
      updateData.receivedAt = new Date();
    }
    if (status === PurchaseOrderStatus.COMPLETED) {
      updateData.completedAt = new Date();
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.updateMany({
        where: { id, tenantId },
        data: updateData,
      });

      if (updated.count !== 1) {
        throw new NotFoundException('Purchase Order not found');
      }

      const freshPo = await tx.purchaseOrder.findFirst({
        where: { id, tenantId },
        include: {
          PurchaseOrderItem: true,
          Warehouse: true,
        },
      });

      if (!freshPo) {
        throw new NotFoundException('Purchase Order not found');
      }

      // When PO is completed, create STOCK_IN movements.
      if (status === PurchaseOrderStatus.COMPLETED) {
        const warehouseId = freshPo.warehouseId;

        if (!warehouseId) {
          throw new BadRequestException('Warehouse is required for receiving');
        }

        for (const item of freshPo.PurchaseOrderItem) {
          const { inventoryItemId, quantity } = item;

          const beforeQty =
            (
              await tx.inventoryStock.findFirst({
                where: { warehouseId, inventoryItemId },
              })
            )?.quantity ?? 0;

          const stock = await tx.inventoryStock.findFirst({
            where: { warehouseId, inventoryItemId },
          });

          if (stock) {
            await tx.inventoryStock.update({
              where: { id: stock.id },
              data: {
                quantity: { increment: quantity },
                updatedAt: new Date(),
              },
            });
          } else {
            await tx.inventoryStock.create({
              data: {
                warehouseId,
                inventoryItemId,
                quantity,
                updatedAt: new Date(),
              },
            });
          }

          await tx.inventoryMovement.create({
            data: {
              tenantId,
              warehouseId,
              inventoryItemId,
              type: InventoryMovementType.STOCK_IN,
              quantity,
              beforeQuantity: beforeQty,
              afterQuantity: beforeQty + quantity,
              note: `PO ${freshPo.poNumber} ${status}`,
              createdById: null,
            },
          });
        }
      }

      return tx.purchaseOrder.findFirst({
        where: { id, tenantId },
        include: { PurchaseOrderItem: true, Supplier: true, Warehouse: true },
      });
    });
  }

  async delete(tenantId: string, id: string) {
    // Schema currently does not support soft-delete fields on PurchaseOrder.
    // Keep delete behavior as a hard delete for now.

    const po = await this.findOne(tenantId, id);

    if (po.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException('Can only delete PO in DRAFT status');
    }

    await this.prisma.purchaseOrder.delete({ where: { id } });

    return this.findOne(tenantId, id);
  }

  private async generatePoNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.purchaseOrder.count({
      where: { tenantId },
    });

    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const sequence = String(count + 1).padStart(5, '0');

    return `PO-${year}${month}-${sequence}`;
  }
}
