import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import {
  AccountingAccountRole,
  InventoryMovementType,
  PurchaseOrderStatus,
} from '@prisma/client';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { BaseService } from '../../core/services/base.service';
import {
  CreatePurchaseOrderDto,
  ListPurchaseOrdersQueryDto,
  ListPriceVariancesQueryDto,
  ReceivePurchaseOrderDto,
  ReturnPurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from './dto';
import { PurchaseOrderItemProps } from './domain/purchase-order.aggregate';
import { DomainEventBus } from '../../core/events/domain-event-bus.service';
import { DOMAIN_EVENTS } from '../../core/events/domain-events';
import { PurchaseOrderRepository } from './purchase-order.repository';
import { InventoryCostingService } from '../inventory/inventory-costing.service';
import {
  AccountingService,
  JournalLineInput,
} from '../finance/accounting.service';

@Injectable()
export class PurchaseOrderService extends BaseService {
  private readonly statusTransitionLocks = new Set<string>();

  constructor(
    protected prisma: PrismaService,
    private readonly eventBus: DomainEventBus,
    private readonly purchaseOrderRepository: PurchaseOrderRepository,
    private readonly costing: InventoryCostingService,
    private readonly accounting: AccountingService,
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
    if (!supplier.isActive) {
      throw new BadRequestException(
        'Inactive suppliers cannot be used for new purchase orders',
      );
    }

    if (warehouseId) {
      const warehouse = await this.prisma.warehouse.findFirst({
        where: { id: warehouseId, tenantId },
        select: { isActive: true },
      });
      if (!warehouse) {
        throw new NotFoundException('Warehouse not found');
      }
      if (!warehouse.isActive) {
        throw new BadRequestException(
          'Inactive warehouses cannot be assigned to new purchase orders',
        );
      }
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
    for (const item of items) {
      const currentItem = inventoryItems.find(
        (inventoryItem) => inventoryItem.id === item.inventoryItemId,
      );
      if (item.unit !== undefined && item.unit !== currentItem?.unit) {
        throw new ConflictException(
          'Inventory item unit changed; reload the Purchase Order form',
        );
      }
    }

    const poNumber = await this.generatePoNumber(tenantId);

    // Normalize items and expected delivery date to explicit types
    const normalizedItems: PurchaseOrderItemProps[] = items.map((item) => ({
      inventoryItemId: item.inventoryItemId,
      unit:
        inventoryItems.find(
          (inventoryItem) => inventoryItem.id === item.inventoryItemId,
        )?.unit ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: Math.round(item.quantity * item.unitPrice),
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
          unit: it.unit,
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
    filters: Partial<ListPurchaseOrdersQueryDto> = new ListPurchaseOrdersQueryDto(),
  ) {
    const {
      status,
      supplierId,
      skip,
      take,
      fromDate,
      toDate,
      search,
      sortBy,
      sortOrder,
    } = filters;
    if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
      throw new BadRequestException('fromDate must not be later than toDate');
    }
    const { skip: paginationSkip, take: paginationTake } =
      this.getPaginationParams(skip, take);

    const result = await this.purchaseOrderRepository.findAll(tenantId, {
      status,
      supplierId,
      search,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      sortBy,
      sortOrder,
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
    if (
      updateData.warehouseId !== undefined &&
      updateData.warehouseId !== po.warehouseId
    ) {
      const warehouse = updateData.warehouseId
        ? await this.prisma.warehouse.findFirst({
            where: { id: updateData.warehouseId, tenantId },
            select: { isActive: true },
          })
        : null;
      if (updateData.warehouseId && !warehouse) {
        throw new NotFoundException('Warehouse not found');
      }
      if (warehouse && !warehouse.isActive) {
        throw new BadRequestException(
          'Inactive warehouses cannot be assigned to purchase orders',
        );
      }
    }
    if (supplierId !== undefined && supplierId !== po.supplierId) {
      const supplier = await this.prisma.supplier.findUnique({
        where: { id: supplierId },
      });
      if (!supplier || supplier.tenantId !== tenantId) {
        throw new NotFoundException('Supplier not found');
      }
      if (!supplier.isActive) {
        throw new BadRequestException(
          'Inactive suppliers cannot be assigned to purchase orders',
        );
      }
    }

    let totalAmount = po.totalAmount;
    let parsedItems: PurchaseOrderItemProps[] | undefined;

    if (items && items.length > 0) {
      parsedItems = [];
      const inventoryItems = await this.prisma.inventoryItem.findMany({
        where: {
          id: { in: items.map((item) => item.inventoryItemId ?? '') },
          tenantId,
        },
        select: { id: true, unit: true },
      });
      if (inventoryItems.length !== items.length) {
        throw new NotFoundException('Some inventory items not found');
      }
      for (const item of items) {
        const currentItem = inventoryItems.find(
          (inventoryItem) => inventoryItem.id === (item.inventoryItemId ?? ''),
        );
        if (item.unit !== undefined && item.unit !== currentItem?.unit) {
          throw new ConflictException(
            'Inventory item unit changed; reload the Purchase Order form',
          );
        }
      }

      for (const item of items) {
        const inventoryItemId = item.inventoryItemId ?? '';
        const quantity = item.quantity ?? 0;
        const unitPrice = item.unitPrice ?? 0;

        if (!inventoryItemId || quantity <= 0 || unitPrice < 0) {
          throw new BadRequestException('Invalid purchase order item');
        }

        parsedItems.push({
          inventoryItemId,
          unit:
            inventoryItems.find(
              (inventoryItem) => inventoryItem.id === inventoryItemId,
            )?.unit ?? null,
          quantity,
          unitPrice,
          subtotal: Math.round(quantity * unitPrice),
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

  async receivePurchaseOrder(
    tenantId: string,
    id: string,
    userId: string,
    idempotencyKey: string,
    dto: ReceivePurchaseOrderDto,
  ) {
    if (
      !idempotencyKey ||
      idempotencyKey.length > 128 ||
      !/^[\x21-\x7e]+$/.test(idempotencyKey)
    ) {
      throw new BadRequestException(
        'A valid Idempotency-Key header of 1 to 128 visible ASCII characters is required',
      );
    }

    if (!Array.isArray(dto.items) || dto.items.length === 0) {
      throw new BadRequestException('At least one receipt item is required');
    }

    const normalizedItems = dto.items.map((item) => ({
      purchaseOrderItemId: item.purchaseOrderItemId.trim(),
      receivedQuantity: item.receivedQuantity,
    }));
    const itemIds = new Set<string>();

    for (const item of normalizedItems) {
      if (!item.purchaseOrderItemId) {
        throw new BadRequestException('Purchase order item id is required');
      }
      if (
        !Number.isFinite(item.receivedQuantity) ||
        item.receivedQuantity < 0.1
      ) {
        throw new BadRequestException(
          'Received quantity must be a finite number of at least 0.1',
        );
      }
      if (itemIds.has(item.purchaseOrderItemId)) {
        throw new BadRequestException(
          'A purchase order item may only appear once per receipt',
        );
      }
      itemIds.add(item.purchaseOrderItemId);
    }

    normalizedItems.sort((a, b) =>
      a.purchaseOrderItemId.localeCompare(b.purchaseOrderItemId),
    );
    const note = dto.note?.trim() || null;
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ items: normalizedItems, note }))
      .digest('hex');

    return this.prisma.$transaction(
      async (tx) => {
        const lockedPo = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "PurchaseOrder"
          WHERE "id" = ${id} AND "tenantId" = ${tenantId}
          FOR UPDATE
        `;

        if (!lockedPo || lockedPo.length !== 1) {
          throw new NotFoundException('Purchase Order not found');
        }

        const po = await tx.purchaseOrder.findFirst({
          where: { id, tenantId },
          include: {
            PurchaseOrderItem: true,
            Tenant: { select: { currencyCode: true } },
          },
        });
        if (!po) {
          throw new NotFoundException('Purchase Order not found');
        }

        const existingReceipt = await tx.purchaseOrderReceipt.findUnique({
          where: {
            purchaseOrderId_idempotencyKey: {
              purchaseOrderId: id,
              idempotencyKey,
            },
          },
          include: {
            Items: {
              include: {
                InventoryItem: {
                  select: { id: true, code: true, name: true, unit: true },
                },
              },
            },
          },
        });

        if (existingReceipt) {
          if (existingReceipt.requestHash !== requestHash) {
            throw new ConflictException(
              'Idempotency-Key was already used with a different receipt request',
            );
          }
          return existingReceipt;
        }

        if (
          po.status !== PurchaseOrderStatus.APPROVED &&
          po.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED
        ) {
          throw new BadRequestException(
            `Cannot receive purchase order while in ${po.status}`,
          );
        }
        if (!po.warehouseId) {
          throw new BadRequestException(
            'Warehouse is required for receiving/receipting',
          );
        }

        const orderItemsById = new Map(
          po.PurchaseOrderItem.map((item) => [item.id, item]),
        );
        const plannedItems = normalizedItems.map((receiptItem) => {
          const orderItem = orderItemsById.get(receiptItem.purchaseOrderItemId);
          if (!orderItem) {
            throw new BadRequestException(
              'Receipt item does not belong to this purchase order',
            );
          }

          const receivedQuantity = orderItem.receivedQuantity ?? 0;
          const nextReceived = receivedQuantity + receiptItem.receivedQuantity;
          if (nextReceived - orderItem.quantity > 1e-9) {
            throw new BadRequestException(
              'Cannot receive more than the ordered quantity',
            );
          }

          return {
            orderItem,
            delta:
              Math.min(nextReceived, orderItem.quantity) - receivedQuantity,
            nextReceived: Math.min(nextReceived, orderItem.quantity),
          };
        });

        const receiptStatus = po.PurchaseOrderItem.every((item) => {
          const receivedItem = plannedItems.find(
            ({ orderItem }) => orderItem.id === item.id,
          );
          const receivedQuantity =
            receivedItem?.nextReceived ?? item.receivedQuantity;
          return receivedQuantity >= item.quantity - 1e-9;
        })
          ? PurchaseOrderStatus.RECEIVED
          : PurchaseOrderStatus.PARTIALLY_RECEIVED;

        const receipt = await tx.purchaseOrderReceipt.create({
          data: {
            tenantId,
            purchaseOrderId: id,
            createdById: userId,
            idempotencyKey,
            requestHash,
            statusAfter: receiptStatus,
            note,
            Items: {
              create: plannedItems.map(({ orderItem, delta }) => ({
                tenantId,
                purchaseOrderItemId: orderItem.id,
                inventoryItemId: orderItem.inventoryItemId,
                receivedQuantity: delta,
                unit: orderItem.unit,
              })),
            },
          },
          include: { Items: true },
        });

        const receiptJournalLines: JournalLineInput[] = [];
        for (const { orderItem, delta, nextReceived } of plannedItems) {
          const inventoryItem = await this.costing.lockItem(
            tx,
            tenantId,
            orderItem.inventoryItemId,
          );
          const updatedItem = await tx.purchaseOrderItem.updateMany({
            where: { id: orderItem.id, purchaseOrderId: id },
            data: { receivedQuantity: nextReceived },
          });
          if (updatedItem.count !== 1) {
            throw Object.assign(
              new Error('Purchase order item changed during receiving'),
              { code: 'P2034' },
            );
          }

          const stock = await tx.inventoryStock.upsert({
            where: {
              warehouseId_inventoryItemId: {
                warehouseId: po.warehouseId,
                inventoryItemId: orderItem.inventoryItemId,
              },
            },
            create: {
              warehouseId: po.warehouseId,
              inventoryItemId: orderItem.inventoryItemId,
              quantity: delta,
              updatedAt: new Date(),
            },
            update: {
              quantity: { increment: delta },
              updatedAt: new Date(),
            },
          });

          const movement = await tx.inventoryMovement.create({
            data: {
              tenantId,
              warehouseId: po.warehouseId,
              inventoryItemId: orderItem.inventoryItemId,
              type: InventoryMovementType.STOCK_IN,
              quantity: delta,
              beforeQuantity: stock.quantity - delta,
              afterQuantity: stock.quantity,
              note: note ?? `PO ${po.poNumber} receipt`,
              createdById: userId,
              referenceType: 'PURCHASE_ORDER_RECEIPT',
              referenceId: receipt.id,
            },
          });
          const receiptItem = receipt.Items.find(
            (item) => item.purchaseOrderItemId === orderItem.id,
          );
          if (!receiptItem) {
            throw new BadRequestException(
              'Purchase order receipt item was not persisted',
            );
          }
          await tx.purchaseOrderReceiptItem.update({
            where: { id: receiptItem.id },
            data: { movementId: movement.id },
          });
          const receiptCost = await this.costing.receive(tx, {
            tenantId,
            inventoryItemId: orderItem.inventoryItemId,
            warehouseId: po.warehouseId,
            quantity: delta,
            unitCost: orderItem.unitPrice,
            sourceType: 'PURCHASE_ORDER_RECEIPT',
            sourceReferenceId: receipt.id,
            movementId: movement.id,
          });
          const purchaseValue = new Prisma.Decimal(orderItem.unitPrice).mul(
            delta,
          );
          receiptJournalLines.push({
            role: AccountingAccountRole.INVENTORY,
            debit: receiptCost.totalCost,
            description: `Inventory received for PO ${po.poNumber}`,
          });
          receiptJournalLines.push({
            role: AccountingAccountRole.GOODS_RECEIVED_NOT_INVOICED,
            credit: purchaseValue,
            description: `Goods received not invoiced for PO ${po.poNumber}`,
          });
          const receiptVariance = purchaseValue.sub(receiptCost.totalCost);
          if (!receiptVariance.isZero()) {
            receiptJournalLines.push(
              receiptVariance.isPositive()
                ? {
                    role: AccountingAccountRole.PURCHASE_PRICE_VARIANCE,
                    debit: receiptVariance,
                    description: `Standard-cost variance for PO ${po.poNumber}`,
                  }
                : {
                    role: AccountingAccountRole.PURCHASE_PRICE_VARIANCE,
                    credit: receiptVariance.abs(),
                    description: `Standard-cost variance for PO ${po.poNumber}`,
                  },
            );
          }
          if (
            inventoryItem.valuationMethod === 'STANDARD_COST' &&
            inventoryItem.standardCost !== null
          ) {
            const actualUnitCost = new Prisma.Decimal(orderItem.unitPrice);
            const standardUnitCost = inventoryItem.standardCost;
            const varianceAmount = actualUnitCost
              .sub(standardUnitCost)
              .mul(delta);
            await tx.inventoryPurchasePriceVariance.create({
              data: {
                tenantId,
                receiptId: receipt.id,
                receiptItemId: receiptItem.id,
                purchaseOrderId: id,
                purchaseOrderItemId: orderItem.id,
                inventoryItemId: orderItem.inventoryItemId,
                warehouseId: po.warehouseId,
                quantity: new Prisma.Decimal(delta),
                unit: inventoryItem.unit,
                standardUnitCost,
                actualUnitCost,
                varianceAmount,
                currencyCode: po.currencyCode ?? po.Tenant.currencyCode,
              },
            });
          }
        }

        if (
          receiptJournalLines.some(
            (line) =>
              !new Prisma.Decimal(line.debit ?? 0).isZero() ||
              !new Prisma.Decimal(line.credit ?? 0).isZero(),
          )
        ) {
          const currencyCode = po.currencyCode ?? po.Tenant.currencyCode;
          if (!currencyCode) {
            throw new ConflictException(
              'Purchase Order currency is required for accounting',
            );
          }
          await this.accounting.postJournal(tx, {
            tenantId,
            entryDate: receipt.createdAt,
            currencyCode,
            sourceType: 'PURCHASE_ORDER_RECEIPT',
            sourceId: receipt.id,
            memo: `Goods receipt for PO ${po.poNumber}`,
            createdById: userId,
            lines: receiptJournalLines,
          });
        }

        const statusUpdate = await tx.purchaseOrder.updateMany({
          where: { id, tenantId, status: po.status },
          data: {
            status: receiptStatus,
            updatedAt: new Date(),
            receivedAt:
              receiptStatus === PurchaseOrderStatus.RECEIVED
                ? new Date()
                : undefined,
          },
        });
        if (statusUpdate.count !== 1) {
          throw Object.assign(
            new Error('Purchase order changed during receiving'),
            { code: 'P2034' },
          );
        }

        const eventType =
          receiptStatus === PurchaseOrderStatus.RECEIVED
            ? DOMAIN_EVENTS.PURCHASE_ORDER_RECEIVED
            : DOMAIN_EVENTS.PURCHASE_ORDER_PARTIALLY_RECEIVED;
        const event = {
          type: eventType,
          payload: {
            purchaseOrderId: id,
            receiptId: receipt.id,
            tenantId,
          },
          occurredAt: new Date(),
        };

        await tx.outboxEvent.create({
          data: {
            tenantId,
            type: eventType,
            payload: JSON.stringify(event),
            status: 'PENDING',
          },
        });

        return receipt;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async returnPurchaseOrder(
    tenantId: string,
    id: string,
    userId: string,
    idempotencyKey: string,
    dto: ReturnPurchaseOrderDto,
  ) {
    if (
      !idempotencyKey ||
      idempotencyKey.length > 128 ||
      !/^[\x21-\x7e]+$/.test(idempotencyKey)
    ) {
      throw new BadRequestException(
        'A valid Idempotency-Key header of 1 to 128 visible ASCII characters is required',
      );
    }
    if (!Array.isArray(dto.items) || dto.items.length === 0) {
      throw new BadRequestException('At least one return item is required');
    }

    const normalizedItems = dto.items.map((item) => ({
      purchaseOrderReceiptItemId: item.purchaseOrderReceiptItemId.trim(),
      quantity: item.quantity,
    }));
    const itemIds = new Set<string>();
    for (const item of normalizedItems) {
      if (!item.purchaseOrderReceiptItemId) {
        throw new BadRequestException(
          'Purchase order receipt item id is required',
        );
      }
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        throw new BadRequestException(
          'Return quantity must be a finite positive number',
        );
      }
      if (itemIds.has(item.purchaseOrderReceiptItemId)) {
        throw new BadRequestException(
          'A purchase order receipt item may only appear once per return',
        );
      }
      itemIds.add(item.purchaseOrderReceiptItemId);
    }
    normalizedItems.sort((a, b) =>
      a.purchaseOrderReceiptItemId.localeCompare(b.purchaseOrderReceiptItemId),
    );
    const note = dto.note?.trim() || null;
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ items: normalizedItems, note }))
      .digest('hex');

    return this.prisma.$transaction(
      async (tx) => {
        const lockedPo = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "PurchaseOrder"
          WHERE "id" = ${id} AND "tenantId" = ${tenantId}
          FOR UPDATE
        `;
        if (lockedPo.length !== 1) {
          throw new NotFoundException('Purchase Order not found');
        }

        const po = await tx.purchaseOrder.findFirst({
          where: { id, tenantId },
          include: {
            PurchaseOrderItem: true,
            Tenant: { select: { currencyCode: true } },
          },
        });
        if (!po) throw new NotFoundException('Purchase Order not found');

        const existingReturn = await tx.purchaseOrderReturn.findUnique({
          where: {
            purchaseOrderId_idempotencyKey: {
              purchaseOrderId: id,
              idempotencyKey,
            },
          },
          include: {
            Items: {
              include: {
                InventoryItem: {
                  select: { id: true, code: true, name: true, unit: true },
                },
                ReceiptItem: {
                  select: { id: true, receiptId: true },
                },
              },
            },
          },
        });
        if (existingReturn) {
          if (existingReturn.requestHash !== requestHash) {
            throw new ConflictException(
              'Idempotency-Key was already used with a different return request',
            );
          }
          return existingReturn;
        }

        if (!po.warehouseId) {
          throw new BadRequestException(
            'A receiving warehouse is required to return purchase order stock',
          );
        }
        const receiptItems = await tx.purchaseOrderReceiptItem.findMany({
          where: {
            tenantId,
            id: {
              in: normalizedItems.map(
                (item) => item.purchaseOrderReceiptItemId,
              ),
            },
            Receipt: { purchaseOrderId: id },
          },
        });
        if (receiptItems.length !== normalizedItems.length) {
          throw new BadRequestException(
            'Return receipt items must belong to this purchase order and tenant',
          );
        }
        const receiptItemsById = new Map(
          receiptItems.map((item) => [item.id, item]),
        );
        const previouslyReturned = await tx.purchaseOrderReturnItem.groupBy({
          by: ['receiptItemId'],
          where: {
            tenantId,
            receiptItemId: {
              in: normalizedItems.map(
                (item) => item.purchaseOrderReceiptItemId,
              ),
            },
          },
          _sum: { quantity: true },
        });
        const returnedByItem = new Map(
          previouslyReturned.map((item) => [
            item.receiptItemId,
            item._sum.quantity ?? 0,
          ]),
        );
        const plannedItems = normalizedItems.map((requestItem) => {
          const receiptItem = receiptItemsById.get(
            requestItem.purchaseOrderReceiptItemId,
          );
          if (!receiptItem) {
            throw new BadRequestException(
              'Return receipt item does not belong to this purchase order',
            );
          }
          const orderItem = po.PurchaseOrderItem.find(
            (item) => item.id === receiptItem.purchaseOrderItemId,
          );
          if (!orderItem) {
            throw new BadRequestException(
              'Purchase order receipt item has no valid order line',
            );
          }
          const remainingReceived =
            receiptItem.receivedQuantity -
            (returnedByItem.get(receiptItem.id) ?? 0);
          if (requestItem.quantity - remainingReceived > 1e-9) {
            throw new BadRequestException(
              'Cannot return more than this receipt quantity not previously returned',
            );
          }
          const unitPrice = new Prisma.Decimal(orderItem.unitPrice);
          return {
            receiptItem,
            orderItem,
            quantity: requestItem.quantity,
            unitPrice,
            creditAmount: unitPrice.mul(requestItem.quantity),
          };
        });
        const creditAmount = plannedItems.reduce(
          (total, item) => total.add(item.creditAmount),
          new Prisma.Decimal(0),
        );
        const returnRecord = await tx.purchaseOrderReturn.create({
          data: {
            tenantId,
            purchaseOrderId: id,
            createdById: userId,
            idempotencyKey,
            requestHash,
            note,
            creditAmount,
            currencyCode: po.currencyCode,
          },
        });

        const returnJournalLines: JournalLineInput[] = [];
        for (const planned of plannedItems) {
          const inventoryItem = await this.costing.lockItem(
            tx,
            tenantId,
            planned.orderItem.inventoryItemId,
          );
          const stockRows = await tx.$queryRaw<
            Array<{ id: string; quantity: number }>
          >`
            SELECT "id", "quantity"
            FROM "InventoryStock"
            WHERE "inventoryItemId" = ${planned.orderItem.inventoryItemId}
              AND "warehouseId" = ${po.warehouseId}
            FOR UPDATE
          `;
          const stock = stockRows[0];
          if (!stock || stock.quantity + 1e-9 < planned.quantity) {
            throw new ConflictException(
              `Insufficient unreserved stock to return ${planned.orderItem.inventoryItemId}`,
            );
          }
          const updated = await tx.inventoryStock.updateMany({
            where: { id: stock.id, quantity: { gte: planned.quantity } },
            data: {
              quantity: { decrement: planned.quantity },
              updatedAt: new Date(),
            },
          });
          if (updated.count !== 1) {
            throw new ConflictException(
              'Inventory changed while the return was being processed',
            );
          }

          const movement = await tx.inventoryMovement.create({
            data: {
              tenantId,
              warehouseId: po.warehouseId,
              inventoryItemId: planned.orderItem.inventoryItemId,
              type: InventoryMovementType.STOCK_OUT,
              quantity: planned.quantity,
              unit: inventoryItem.unit,
              beforeQuantity: stock.quantity,
              afterQuantity: stock.quantity - planned.quantity,
              note: note ?? `Supplier return for PO ${po.poNumber}`,
              createdById: userId,
              referenceType: 'PURCHASE_ORDER_RETURN',
              referenceId: returnRecord.id,
            },
          });
          const inventoryCost = await this.costing.issue(tx, {
            tenantId,
            inventoryItemId: planned.orderItem.inventoryItemId,
            warehouseId: po.warehouseId,
            quantity: planned.quantity,
            movementId: movement.id,
          });
          const postedInvoices = await tx.supplierInvoiceLine.aggregate({
            where: {
              tenantId,
              receiptItemId: planned.receiptItem.id,
              Invoice: {
                status: {
                  in: ['POSTED', 'PARTIALLY_PAID', 'PAID'],
                },
              },
            },
            _sum: { quantity: true },
          });
          const invoicedQuantity = new Prisma.Decimal(
            postedInvoices._sum.quantity ?? 0,
          );
          const priorInvoicedReturns =
            await tx.purchaseOrderReturnItem.aggregate({
              where: {
                tenantId,
                receiptItemId: planned.receiptItem.id,
              },
              _sum: { invoicedQuantity: true },
            });
          const priorInvoicedReturnQuantity = new Prisma.Decimal(
            priorInvoicedReturns._sum.invoicedQuantity ?? 0,
          );
          const invoicedReturnQuantity = Prisma.Decimal.min(
            new Prisma.Decimal(planned.quantity),
            Prisma.Decimal.max(
              invoicedQuantity.sub(priorInvoicedReturnQuantity),
              new Prisma.Decimal(0),
            ),
          );
          const clearingValue = planned.unitPrice.mul(invoicedReturnQuantity);
          const grniValue = planned.creditAmount.sub(clearingValue);
          if (grniValue.gt(0)) {
            returnJournalLines.push({
              role: AccountingAccountRole.GOODS_RECEIVED_NOT_INVOICED,
              debit: grniValue,
              description: `Uninvoiced supplier return for PO ${po.poNumber}`,
            });
          }
          if (clearingValue.gt(0)) {
            returnJournalLines.push({
              role: AccountingAccountRole.SUPPLIER_RETURN_CLEARING,
              debit: clearingValue,
              description: `Invoiced supplier return for PO ${po.poNumber}`,
            });
          }
          if (inventoryCost.totalCost.gt(0)) {
            returnJournalLines.push({
              role: AccountingAccountRole.INVENTORY,
              credit: inventoryCost.totalCost,
              description: `Inventory returned for PO ${po.poNumber}`,
            });
          }
          const returnVariance = planned.creditAmount.sub(
            inventoryCost.totalCost,
          );
          if (!returnVariance.isZero()) {
            returnJournalLines.push(
              returnVariance.isPositive()
                ? {
                    role: AccountingAccountRole.PURCHASE_PRICE_VARIANCE,
                    credit: returnVariance,
                    description: `Return valuation variance for PO ${po.poNumber}`,
                  }
                : {
                    role: AccountingAccountRole.PURCHASE_PRICE_VARIANCE,
                    debit: returnVariance.abs(),
                    description: `Return valuation variance for PO ${po.poNumber}`,
                  },
            );
          }
          await tx.purchaseOrderReturnItem.create({
            data: {
              tenantId,
              returnId: returnRecord.id,
              purchaseOrderItemId: planned.orderItem.id,
              receiptItemId: planned.receiptItem.id,
              inventoryItemId: planned.orderItem.inventoryItemId,
              quantity: planned.quantity,
              unit: inventoryItem.unit,
              unitPrice: planned.unitPrice,
              creditAmount: planned.creditAmount,
              inventoryCost: inventoryCost.totalCost,
              invoicedQuantity: invoicedReturnQuantity,
              invoicedCreditAmount: clearingValue,
            },
          });
        }

        if (
          returnJournalLines.some(
            (line) =>
              !new Prisma.Decimal(line.debit ?? 0).isZero() ||
              !new Prisma.Decimal(line.credit ?? 0).isZero(),
          )
        ) {
          const currencyCode = po.currencyCode ?? po.Tenant.currencyCode;
          if (!currencyCode) {
            throw new ConflictException(
              'Purchase Order currency is required for accounting',
            );
          }
          await this.accounting.postJournal(tx, {
            tenantId,
            entryDate: returnRecord.createdAt,
            currencyCode,
            sourceType: 'PURCHASE_ORDER_RETURN',
            sourceId: returnRecord.id,
            memo: `Supplier return for PO ${po.poNumber}`,
            createdById: userId,
            lines: returnJournalLines,
          });
        }

        const event = {
          type: DOMAIN_EVENTS.PURCHASE_ORDER_RETURNED,
          payload: { purchaseOrderId: id, returnId: returnRecord.id, tenantId },
          occurredAt: new Date(),
        };
        await tx.outboxEvent.create({
          data: {
            tenantId,
            type: DOMAIN_EVENTS.PURCHASE_ORDER_RETURNED,
            payload: JSON.stringify(event),
            status: 'PENDING',
          },
        });

        return tx.purchaseOrderReturn.findUnique({
          where: { id: returnRecord.id },
          include: {
            Items: {
              include: {
                InventoryItem: {
                  select: { id: true, code: true, name: true, unit: true },
                },
                ReceiptItem: {
                  select: { id: true, receiptId: true },
                },
              },
            },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async findReturnableReceiptItems(
    tenantId: string,
    id: string,
    skip?: number,
    take?: number,
  ) {
    await this.findOne(tenantId, id);
    const pagination = this.getPaginationParams(skip, take);
    const where = { tenantId, Receipt: { purchaseOrderId: id } };
    const [receiptItems, total] = await Promise.all([
      this.prisma.purchaseOrderReceiptItem.findMany({
        where,
        include: {
          Receipt: { select: { id: true, createdAt: true, note: true } },
          PurchaseOrderItem: {
            select: { id: true, unitPrice: true },
          },
          InventoryItem: {
            select: { id: true, code: true, name: true, unit: true },
          },
        },
        orderBy: [{ Receipt: { createdAt: 'asc' } }, { id: 'asc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.purchaseOrderReceiptItem.count({ where }),
    ]);
    const returnedQuantities =
      receiptItems.length > 0
        ? await this.prisma.purchaseOrderReturnItem.groupBy({
            by: ['receiptItemId'],
            where: {
              tenantId,
              receiptItemId: { in: receiptItems.map((item) => item.id) },
            },
            _sum: { quantity: true },
          })
        : [];
    const returnedByReceiptItem = new Map(
      returnedQuantities.map((item) => [
        item.receiptItemId,
        item._sum.quantity ?? 0,
      ]),
    );
    return {
      ...this.formatPaginatedResponse(
        receiptItems.map((item) => ({
          ...item,
          returnedQuantity: returnedByReceiptItem.get(item.id) ?? 0,
          returnableQuantity: Math.max(
            item.receivedQuantity - (returnedByReceiptItem.get(item.id) ?? 0),
            0,
          ),
        })),
        total,
        pagination.skip,
        pagination.take,
      ),
    };
  }

  async findReturns(
    tenantId: string,
    id: string,
    skip?: number,
    take?: number,
  ) {
    await this.findOne(tenantId, id);
    const pagination = this.getPaginationParams(skip, take);
    const where = { tenantId, purchaseOrderId: id };
    const [data, total, returnTotals] = await Promise.all([
      this.prisma.purchaseOrderReturn.findMany({
        where,
        include: {
          User: { select: { id: true, email: true } },
          Items: {
            include: {
              InventoryItem: {
                select: { id: true, code: true, name: true, unit: true },
              },
              ReceiptItem: {
                select: { id: true, receiptId: true },
              },
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.purchaseOrderReturn.count({ where }),
      this.prisma.purchaseOrderReturnItem.groupBy({
        by: ['receiptItemId'],
        where: {
          tenantId,
          Return: { purchaseOrderId: id },
        },
        _sum: { quantity: true },
      }),
    ]);
    const returnedQuantityByReceiptItem = returnTotals.reduce<
      Record<string, number>
    >((totals, item) => {
      if (item.receiptItemId) {
        totals[item.receiptItemId] = item._sum.quantity ?? 0;
      }
      return totals;
    }, {});
    return {
      ...this.formatPaginatedResponse(
        data,
        total,
        pagination.skip,
        pagination.take,
      ),
      returnedQuantityByReceiptItem,
    };
  }

  cancel(tenantId: string, id: string) {
    return this.updateStatus(tenantId, id, PurchaseOrderStatus.CANCELLED);
  }

  async findReceipts(
    tenantId: string,
    id: string,
    skip?: number,
    take?: number,
  ) {
    await this.findOne(tenantId, id);

    const pagination = this.getPaginationParams(skip, take);
    const where = { tenantId, purchaseOrderId: id };
    const [receipts, total] = await Promise.all([
      this.prisma.purchaseOrderReceipt.findMany({
        where,
        include: {
          User: { select: { id: true, email: true } },
          Items: {
            include: {
              InventoryItem: {
                select: { id: true, code: true, name: true, unit: true },
              },
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.purchaseOrderReceipt.count({ where }),
    ]);

    return this.formatPaginatedResponse(
      receipts,
      total,
      pagination.skip,
      pagination.take,
    );
  }

  async findPriceVariances(
    tenantId: string,
    query: ListPriceVariancesQueryDto,
  ) {
    if (query.fromDate && query.toDate && query.fromDate > query.toDate) {
      throw new BadRequestException(
        'The start date must not be later than the end date',
      );
    }
    const pagination = this.getPaginationParams(query.skip, query.take);
    const toDateExclusive = query.toDate
      ? new Date(`${query.toDate}T00:00:00.000Z`)
      : undefined;
    toDateExclusive?.setUTCDate(toDateExclusive.getUTCDate() + 1);
    const where: Prisma.InventoryPurchasePriceVarianceWhereInput = {
      tenantId,
      ...(query.fromDate || query.toDate
        ? {
            createdAt: {
              ...(query.fromDate
                ? { gte: new Date(`${query.fromDate}T00:00:00.000Z`) }
                : {}),
              ...(query.toDate ? { lt: toDateExclusive } : {}),
            },
          }
        : {}),
    };
    const [data, total, totals] = await Promise.all([
      this.prisma.inventoryPurchasePriceVariance.findMany({
        where,
        include: {
          PurchaseOrder: {
            select: {
              id: true,
              poNumber: true,
              supplierId: true,
              Supplier: { select: { id: true, name: true } },
            },
          },
          InventoryItem: {
            select: { id: true, code: true, name: true, unit: true },
          },
          Warehouse: { select: { id: true, code: true, name: true } },
          Receipt: { select: { id: true, createdAt: true, note: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.inventoryPurchasePriceVariance.count({ where }),
      this.prisma.inventoryPurchasePriceVariance.groupBy({
        by: ['currencyCode'],
        where,
        _sum: { varianceAmount: true },
        _count: { id: true },
      }),
    ]);
    return {
      data: data.map((entry) => ({
        ...entry,
        accountingStatus: 'NOT_POSTED' as const,
      })),
      pagination: {
        ...pagination,
        total,
        pages: Math.ceil(total / pagination.take),
      },
      totals: totals.map((entry) => ({
        currencyCode: entry.currencyCode,
        varianceAmount: entry._sum.varianceAmount ?? new Prisma.Decimal(0),
        count: entry._count.id,
      })),
      accountingStatus: 'NOT_POSTED' as const,
    };
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: PurchaseOrderStatus,
  ) {
    const lockKey = `${tenantId}:${id}`;
    if (this.statusTransitionLocks.has(lockKey)) {
      throw Object.assign(
        new Error('Purchase order was updated by another transaction'),
        { code: 'P2034' },
      );
    }

    this.statusTransitionLocks.add(lockKey);

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const lockedPo = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM "PurchaseOrder"
            WHERE "id" = ${id} AND "tenantId" = ${tenantId}
            FOR UPDATE
          `;

          if (!lockedPo || lockedPo.length !== 1) {
            throw new NotFoundException('Purchase Order not found');
          }

          const po = await tx.purchaseOrder.findFirst({
            where: { id, tenantId },
            include: { PurchaseOrderItem: true, Warehouse: true },
          });

          if (!po) {
            throw new NotFoundException('Purchase Order not found');
          }

          if (po.status === status) {
            return po;
          }

          if (
            (status === PurchaseOrderStatus.PARTIALLY_RECEIVED ||
              status === PurchaseOrderStatus.RECEIVED) &&
            (po.status === PurchaseOrderStatus.APPROVED ||
              po.status === PurchaseOrderStatus.PARTIALLY_RECEIVED)
          ) {
            throw new BadRequestException(
              'Use the purchase order receipt endpoint to receive items',
            );
          }

          const validTransitions: Record<
            PurchaseOrderStatus,
            PurchaseOrderStatus[]
          > = {
            [PurchaseOrderStatus.DRAFT]: [
              PurchaseOrderStatus.PENDING,
              PurchaseOrderStatus.CANCELLED,
            ],
            [PurchaseOrderStatus.PENDING]: [
              PurchaseOrderStatus.APPROVED,
              PurchaseOrderStatus.REJECTED,
              PurchaseOrderStatus.CANCELLED,
            ],
            [PurchaseOrderStatus.APPROVED]: [PurchaseOrderStatus.CANCELLED],
            [PurchaseOrderStatus.PARTIALLY_RECEIVED]: [
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

          const transitionResult = await tx.purchaseOrder.updateMany({
            where: { id, tenantId, status: po.status },
            data: {
              status,
              updatedAt: new Date(),
              completedAt:
                status === PurchaseOrderStatus.COMPLETED
                  ? new Date()
                  : undefined,
            },
          });

          if (transitionResult.count !== 1) {
            throw Object.assign(
              new Error('Purchase order was updated by another transaction'),
              { code: 'P2034' },
            );
          }

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
            include: {
              PurchaseOrderItem: true,
              Supplier: true,
              Warehouse: true,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } finally {
      this.statusTransitionLocks.delete(lockKey);
    }
  }
  async delete(tenantId: string, id: string) {
    // Schema currently does not support soft-delete fields on PurchaseOrder.
    // Keep delete behavior as a hard delete for now.

    const po = await this.findOne(tenantId, id);

    if (po.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException('Can only delete PO in DRAFT status');
    }

    await this.prisma.purchaseOrder.deleteMany({
      where: { id, tenantId },
    });

    return { success: true };
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
