import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryMovementType, PurchaseOrderStatus } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { BaseService } from '../../core/services/base.service';
import { CreatePurchaseOrderDto, UpdatePurchaseOrderDto } from './dto';
import { PurchaseOrderItemProps } from './domain/purchase-order.aggregate';
import { DomainEventBus } from '../../core/events/domain-event-bus.service';
import { DOMAIN_EVENTS } from '../../core/events/domain-events';
import { PurchaseOrderRepository } from './purchase-order.repository';

@Injectable()
export class PurchaseOrderService extends BaseService {
  constructor(
    protected prisma: PrismaService,
    private readonly eventBus: DomainEventBus,
    private readonly purchaseOrderRepository: PurchaseOrderRepository,
  ) {
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

    const poNumber = await this.generatePoNumber(tenantId);

    // Normalize items and expected delivery date to explicit types
    const normalizedItems: PurchaseOrderItemProps[] = items.map((item) => ({
      inventoryItemId: item.inventoryItemId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.quantity * item.unitPrice,
    }));

    const normalizedExpectedDeliveryDate: Date | null = expectedDeliveryDate
      ? new Date(expectedDeliveryDate)
      : null;

    const purchaseOrder =
      await this.purchaseOrderRepository.createPurchaseOrder({
        tenantId,
        poNumber,
        supplierId,
        warehouseId: warehouseId ?? null,
        expectedDeliveryDate: normalizedExpectedDeliveryDate,
        notes: notes ?? null,
        items: normalizedItems.map((it) => ({
          inventoryItemId: it.inventoryItemId,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
        })),
      });

    await this.eventBus.publish({
      type: DOMAIN_EVENTS.PURCHASE_ORDER_CREATED,
      payload: {
        purchaseOrderId: purchaseOrder.id,
        tenantId,
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

    const result = await this.purchaseOrderRepository.findAll(tenantId, {
      status,
      supplierId,
      skip: paginationSkip,
      take: paginationTake,
    });

    return this.formatPaginatedResponse(
      result.data,
      result.total,
      paginationSkip,
      paginationTake,
    );
  }

  async findOne(tenantId: string, id: string) {
    const purchaseOrder = await this.purchaseOrderRepository.findOne(
      id,
      tenantId,
    );

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
    let parsedItems: PurchaseOrderItemProps[] | undefined;

    if (items && items.length > 0) {
      parsedItems = [];

      for (const item of items) {
        const inventoryItemId = item.inventoryItemId ?? '';
        const quantity = item.quantity ?? 0;
        const unitPrice = item.unitPrice ?? 0;

        if (!inventoryItemId || quantity <= 0 || unitPrice < 0) {
          throw new BadRequestException('Invalid purchase order item');
        }

        parsedItems.push({
          inventoryItemId,
          quantity,
          unitPrice,
          subtotal: quantity * unitPrice,
        });
      }

      totalAmount = parsedItems.reduce(
        (sum: number, item) => sum + item.subtotal,
        0,
      );
    }

    let expectedDeliveryDate: Date | null = null;

    if (updateData.expectedDeliveryDate !== undefined) {
      expectedDeliveryDate = updateData.expectedDeliveryDate
        ? new Date(updateData.expectedDeliveryDate)
        : null;
    } else {
      const persisted = po.expectedDeliveryDate as
        | Date
        | string
        | null
        | undefined;
      expectedDeliveryDate = persisted ? new Date(persisted) : null;
    }

    const updated = await this.purchaseOrderRepository.update(id, tenantId, {
      supplierId: supplierId ?? po.supplierId,
      warehouseId: updateData.warehouseId ?? po.warehouseId,
      expectedDeliveryDate,
      notes: updateData.notes === undefined ? po.notes : updateData.notes,
      totalAmount,
      items: parsedItems,
    });

    if (!updated) {
      throw new BadRequestException('Purchase Order not found');
    }

    return updated;
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
          PurchaseOrderStatus.CANCELLED,
        ],
        [PurchaseOrderStatus.PARTIALLY_RECEIVED]: [
          PurchaseOrderStatus.RECEIVED,
          PurchaseOrderStatus.CANCELLED,
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

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.updateMany({
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

      if (status === PurchaseOrderStatus.RECEIVED) {
        await this.eventBus.publish({
          type: DOMAIN_EVENTS.PURCHASE_ORDER_RECEIVED,
          payload: {
            purchaseOrderId: id,
            tenantId,
          },
        });
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
