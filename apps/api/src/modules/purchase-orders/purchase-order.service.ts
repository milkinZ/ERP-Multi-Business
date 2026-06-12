import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { BaseService } from '../../core/services/base.service';
import { CreatePurchaseOrderDto, UpdatePurchaseOrderDto } from './dto';
import { InventoryMovementType, PurchaseOrderStatus } from '@prisma/client';

@Injectable()
export class PurchaseOrderService extends BaseService {
  constructor(protected prisma: PrismaService) {
    super(prisma);
  }

  async create(tenantId: string, userId: string, dto: CreatePurchaseOrderDto) {
    const { supplierId, warehouseId, expectedDeliveryDate, notes, items } = dto;

    // Validate supplier exists
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
    });

    if (!supplier || supplier.tenantId !== tenantId) {
      throw new NotFoundException('Supplier not found');
    }

    // Validate inventory items exist
    const inventoryItems = await this.prisma.inventoryItem.findMany({
      where: {
        id: { in: items.map((item) => item.inventoryItemId) },
        tenantId,
      },
    });

    if (inventoryItems.length !== items.length) {
      throw new BadRequestException('Some inventory items not found');
    }

    // Calculate total amount
    const totalAmount = items.reduce((sum, item) => {
      return sum + item.quantity * item.unitPrice;
    }, 0);

    // Generate PO Number
    const poNumber = await this.generatePoNumber(tenantId);

    // Create PurchaseOrder
    const purchaseOrder = await this.prisma.purchaseOrder.create({
      data: {
        poNumber,
        status: PurchaseOrderStatus.DRAFT,
        supplierId,
        tenantId,
        warehouseId,
        expectedDeliveryDate: expectedDeliveryDate
          ? new Date(expectedDeliveryDate)
          : null,
        totalAmount,
        notes,
        // createdById: userId,
        items: {
          create: items.map((item) => ({
            inventoryItemId: item.inventoryItemId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.quantity * item.unitPrice,
          })),
        },
      },
      include: {
        items: true,
        supplier: true,
        // createdBy: true,
      },
    });

    return purchaseOrder;
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

    const where: any = {
      tenantId,
      // deletedAt: null
    };
    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;

    const [data, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        include: {
          items: true,
          supplier: true,
          // createdBy: true,
          // updatedBy: true,
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
        items: { include: { inventoryItem: true } },
        supplier: true,
        // createdBy: true,
        warehouse: true,
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

    // Can only edit DRAFT or PENDING status
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

    // If items are updated
    if (items && items.length > 0) {
      // Delete existing items
      await this.prisma.purchaseOrderItem.deleteMany({
        where: { purchaseOrderId: id },
      });

      // Calculate new total
      totalAmount = items.reduce((sum, item) => {
        return sum + (item.quantity || 0) * (item.unitPrice || 0);
      }, 0);
    }

    const updatedPo = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        ...updateData,
        totalAmount,
        // updatedById: userId,
        items: items
          ? {
              create: items.map((item) => ({
                inventoryItemId: item.inventoryItemId!,
                quantity: item.quantity!,
                unitPrice: item.unitPrice!,
                subtotal: item.quantity! * item.unitPrice!,
              })),
            }
          : undefined,
      },
      include: {
        items: true,
        supplier: true,
        // updatedBy: true
      },
    });

    return updatedPo;
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: PurchaseOrderStatus,
  ) {
    const po = await this.findOne(tenantId, id);

    // Validate status transition
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

    const updateData: any = { status };

    if (status === PurchaseOrderStatus.RECEIVED) {
      updateData.receivedAt = new Date();
    }

    if (status === PurchaseOrderStatus.COMPLETED) {
      updateData.completedAt = new Date();
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.updateMany({
        where: {
          id,
          tenantId,
        },
        data: updateData,
      });

      if (updated.count !== 1) {
        throw new NotFoundException('Purchase Order not found');
      }

      const freshPo = await tx.purchaseOrder.findFirst({
        where: {
          id,
          tenantId,
        },
        include: {
          items: true,
        },
      });

      if (!freshPo) {
        throw new NotFoundException('Purchase Order not found');
      }

      // Ensure inventory movements are created only when PO is COMPLETED.
      // This prevents double counting across RECEIVED -> COMPLETED transitions.
      if (status === PurchaseOrderStatus.COMPLETED) {
        // warehouseId boleh null sesuai perubahan schema InventoryStock.
        // Jika null, kita tetap tulis inventoryStock/inventoryMovement dengan warehouseId=null.
        const warehouseId = freshPo.warehouseId ?? undefined;

        for (const item of freshPo.items) {
          const { inventoryItemId, quantity } = item;

          const beforeQty =
            (
              await tx.inventoryStock.findFirst({
                where: {
                  warehouseId,
                  inventoryItemId,
                },
              })
            )?.quantity ?? 0;

          const stock = await tx.inventoryStock.findFirst({
            where: {
              warehouseId,
              inventoryItemId,
            },
          });

          if (stock) {
            await tx.inventoryStock.update({
              where: { id: stock.id },
              data: {
                quantity: {
                  increment: quantity,
                },
              },
            });
          } else {
            await tx.inventoryStock.create({
              data: {
                warehouseId: freshPo?.warehouseId,
                inventoryItemId,
                quantity,
              },
            });
          }

          await tx.inventoryMovement.create({
            data: {
              tenantId,
              warehouseId: freshPo.warehouseId,
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
        where: {
          id,
          tenantId,
        },
        include: { items: true },
      });
    });
  }

  async delete(tenantId: string, id: string, userId: string) {
    const po = await this.findOne(tenantId, id);

    if (po.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException('Can only delete PO in DRAFT status');
    }

    // Soft delete
    const deleted = await this.prisma.purchaseOrder.updateMany({
      where: {
        id,
        tenantId,
      },
      data: {
        // deletedAt: new Date(),
        // deletedById: userId,
      },
    });

    if (deleted.count !== 1) {
      throw new NotFoundException('Purchase Order not found');
    }

    const deletedPo = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
    });

    return {
      message: 'Purchase Order deleted successfully',
      data: deletedPo,
    };
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
