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
      receivedQuantity: 0,
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
          receivedQuantity: 0,
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

    // Idempotent status transitions: if already in target status, return.
    if (po.status === status) {
      return po;
    }

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

    // Receiving transitions must include receivedQuantity increments.
    // Controller currently only passes status; minimal approach: require received quantities
    // to be present in DTO for receiving endpoints by calling updateStatus with body.
    return this.prisma.$transaction(async (tx) => {
      // Re-load with items including receivedQuantity
      const freshPo = await tx.purchaseOrder.findFirst({
        where: { id, tenantId },
        include: { PurchaseOrderItem: true, Warehouse: true },
      });

      if (!freshPo) {
        throw new NotFoundException('Purchase Order not found');
      }

      // Apply stock delta only on receiving status transitions.
      // Determine nextReceivedQuantities using PurchaseOrderItem.receivedQuantity already persisted.
      // Since current API doesn’t pass receiving quantities, we treat status RECEIVED/COMPLETED as:
      // - receivedQuantity becomes full quantity
      // This keeps backward compatibility while enabling idempotent inventory movements.
      // Future partial receiving can pass explicit receivedQuantity via repository/DTO.

      const warehouseId = freshPo.warehouseId;

      if (
        (status === PurchaseOrderStatus.PARTIALLY_RECEIVED ||
          status === PurchaseOrderStatus.RECEIVED ||
          status === PurchaseOrderStatus.COMPLETED) &&
        !warehouseId
      ) {
        throw new BadRequestException(
          'Warehouse is required for receiving/receipting',
        );
      }

      // Idempotency: compute delta and apply inventory updates only for newly received.
      const movementsToCreate: Array<{
        inventoryItemId: string;
        delta: number;
      }> = [];

      if (
        status === PurchaseOrderStatus.PARTIALLY_RECEIVED ||
        status === PurchaseOrderStatus.RECEIVED ||
        status === PurchaseOrderStatus.COMPLETED
      ) {
        for (const item of freshPo.PurchaseOrderItem) {
          const prevReceived = item.receivedQuantity ?? 0;
          const nextReceived =
            status === PurchaseOrderStatus.PARTIALLY_RECEIVED
              ? prevReceived // keep as-is until explicit partial quantities are supported
              : item.quantity; // on RECEIVED/COMPLETED treat as fully received

          if (nextReceived < prevReceived) {
            throw new BadRequestException(
              'Cannot decrease received quantity on receiving',
            );
          }

          const delta = nextReceived - prevReceived;
          if (delta > 0) {
            movementsToCreate.push({
              inventoryItemId: item.inventoryItemId,
              delta,
            });
          }
        }
      }

      // Persist status with expected-current guard
      const updated = await tx.purchaseOrder.updateMany({
        where: { id, tenantId, status: freshPo.status },
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

      // Apply inventory stock + inventory movements for newly received deltas
      if (movementsToCreate.length > 0) {
        for (const m of movementsToCreate) {
          const beforeQty =
            (
              await tx.inventoryStock.findFirst({
                where: { warehouseId, inventoryItemId: m.inventoryItemId },
              })
            )?.quantity ?? 0;

          const stock = await tx.inventoryStock.findFirst({
            where: { warehouseId, inventoryItemId: m.inventoryItemId },
          });

          if (stock) {
            await tx.inventoryStock.update({
              where: { id: stock.id },
              data: {
                quantity: { increment: m.delta },
                updatedAt: new Date(),
              },
            });
          } else {
            await tx.inventoryStock.create({
              data: {
                warehouseId,
                inventoryItemId: m.inventoryItemId,
                quantity: m.delta,
                updatedAt: new Date(),
              },
            });
          }

          await tx.inventoryMovement.create({
            data: {
              tenantId,
              warehouseId,
              inventoryItemId: m.inventoryItemId,
              type: InventoryMovementType.STOCK_IN,
              quantity: m.delta,
              beforeQuantity: beforeQty,
              afterQuantity: beforeQty + m.delta,
              note: `PO ${freshPo.poNumber} ${status}`,
              createdById: null,
              referenceType: 'PURCHASE_ORDER',
              referenceId: freshPo.id,
            },
          });
        }
      }

      // Update receivedQuantity fields when we move to fully received/completed.
      if (
        status === PurchaseOrderStatus.RECEIVED ||
        status === PurchaseOrderStatus.COMPLETED
      ) {
        await tx.purchaseOrderItem
          .updateMany({
            where: {
              purchaseOrderId: id,
              receivedQuantity: {
                lt: tx.purchaseOrderItem.fields.quantity,
              },
            },
            data: {
              receivedQuantity: tx.purchaseOrderItem.fields
                .quantity as unknown as number,
            },
          })
          .catch(() => {
            // Fallback: update per item to avoid Prisma field limitations in this skeleton.
          });

        for (const item of freshPo.PurchaseOrderItem) {
          const prevReceived = item.receivedQuantity ?? 0;
          if (prevReceived === item.quantity) continue;
          await tx.purchaseOrderItem.update({
            where: { id: item.id },
            data: { receivedQuantity: item.quantity },
          });
        }
      }

      // Publish required domain events for lifecycle transitions
      const publishBasePayload = {
        purchaseOrderId: id,
        tenantId,
      };

      if (status === PurchaseOrderStatus.PENDING) {
        await this.eventBus.publish({
          type: DOMAIN_EVENTS.PURCHASE_ORDER_PENDING_APPROVAL,
          payload: publishBasePayload,
        });
      }
      if (status === PurchaseOrderStatus.APPROVED) {
        await this.eventBus.publish({
          type: DOMAIN_EVENTS.PURCHASE_ORDER_APPROVED,
          payload: publishBasePayload,
        });
      }
      if (status === PurchaseOrderStatus.REJECTED) {
        await this.eventBus.publish({
          type: DOMAIN_EVENTS.PURCHASE_ORDER_REJECTED,
          payload: publishBasePayload,
        });
      }
      if (status === PurchaseOrderStatus.PARTIALLY_RECEIVED) {
        await this.eventBus.publish({
          type: DOMAIN_EVENTS.PURCHASE_ORDER_PARTIALLY_RECEIVED,
          payload: publishBasePayload,
        });
      }
      if (status === PurchaseOrderStatus.RECEIVED) {
        await this.eventBus.publish({
          type: DOMAIN_EVENTS.PURCHASE_ORDER_RECEIVED,
          payload: publishBasePayload,
        });
      }
      if (status === PurchaseOrderStatus.COMPLETED) {
        await this.eventBus.publish({
          type: DOMAIN_EVENTS.PURCHASE_ORDER_COMPLETED,
          payload: publishBasePayload,
        });
      }
      if (status === PurchaseOrderStatus.CANCELLED) {
        await this.eventBus.publish({
          type: DOMAIN_EVENTS.PURCHASE_ORDER_CANCELLED,
          payload: publishBasePayload,
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
