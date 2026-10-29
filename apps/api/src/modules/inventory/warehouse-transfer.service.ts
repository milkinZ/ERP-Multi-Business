import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryMovementType,
  Prisma,
  WarehouseTransferStatus,
} from '@prisma/client';
import { createHash } from 'crypto';

import { PrismaService } from '../../core/database/prisma.service';
import {
  DOMAIN_EVENTS,
  DomainEventName,
} from '../../core/events/domain-events';
import { CreateWarehouseTransferDto } from './dto/create-warehouse-transfer.dto';
import { ReceiveWarehouseTransferDto } from './dto/receive-warehouse-transfer.dto';
import { InventoryCostingService } from './inventory-costing.service';

const transferSummaryInclude = {
  SourceWarehouse: {
    select: { id: true, name: true, code: true, outletId: true },
  },
  DestinationWarehouse: {
    select: { id: true, name: true, code: true, outletId: true },
  },
  Items: {
    include: {
      InventoryItem: {
        select: { id: true, name: true, code: true, unit: true },
      },
    },
  },
} satisfies Prisma.WarehouseTransferInclude;

const transferDetailInclude = {
  ...transferSummaryInclude,
  CreatedBy: { select: { id: true, email: true } },
  ShippedBy: { select: { id: true, email: true } },
  Receipts: {
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    include: {
      CreatedBy: { select: { id: true, email: true } },
      Items: {
        include: {
          InventoryItem: {
            select: { id: true, name: true, code: true, unit: true },
          },
        },
      },
    },
  },
} satisfies Prisma.WarehouseTransferInclude;

@Injectable()
export class WarehouseTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costing: InventoryCostingService = new InventoryCostingService(),
  ) {}

  async create(
    tenantId: string,
    userId: string,
    idempotencyKey: string,
    dto: CreateWarehouseTransferDto,
  ) {
    this.assertIdempotencyKey(idempotencyKey);
    const sourceWarehouseId = dto.sourceWarehouseId.trim();
    const destinationWarehouseId = dto.destinationWarehouseId.trim();
    if (!sourceWarehouseId || !destinationWarehouseId) {
      throw new BadRequestException('Both warehouse ids are required');
    }
    if (sourceWarehouseId === destinationWarehouseId) {
      throw new BadRequestException(
        'Source and destination warehouses must be different',
      );
    }
    if (
      !Array.isArray(dto.items) ||
      dto.items.length < 1 ||
      dto.items.length > 100
    ) {
      throw new BadRequestException(
        'A transfer must contain between 1 and 100 inventory items',
      );
    }

    const normalizedItems = dto.items.map((item) => ({
      inventoryItemId: item.inventoryItemId.trim(),
      quantity: item.quantity,
    }));
    const itemIds = new Set<string>();
    for (const item of normalizedItems) {
      if (!item.inventoryItemId) {
        throw new BadRequestException('Inventory item id is required');
      }
      if (!Number.isFinite(item.quantity) || item.quantity < 0.1) {
        throw new BadRequestException(
          'Transfer quantity must be a finite number of at least 0.1',
        );
      }
      if (itemIds.has(item.inventoryItemId)) {
        throw new BadRequestException(
          'An inventory item may only appear once per transfer',
        );
      }
      itemIds.add(item.inventoryItemId);
    }
    normalizedItems.sort((a, b) =>
      a.inventoryItemId.localeCompare(b.inventoryItemId),
    );

    const note = dto.note?.trim() || null;
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          sourceWarehouseId,
          destinationWarehouseId,
          items: normalizedItems,
          note,
        }),
      )
      .digest('hex');

    const existingTransfer = await this.prisma.warehouseTransfer.findUnique({
      where: {
        tenantId_idempotencyKey: { tenantId, idempotencyKey },
      },
      include: transferDetailInclude,
    });
    if (existingTransfer) {
      return this.replayOrConflict(existingTransfer, requestHash);
    }

    try {
      const transfer = await this.prisma.$transaction(async (tx) => {
        const [source, destination, inventoryItems] = await Promise.all([
          tx.warehouse.findFirst({
            where: { id: sourceWarehouseId, tenantId },
            select: { id: true, isActive: true },
          }),
          tx.warehouse.findFirst({
            where: { id: destinationWarehouseId, tenantId },
            select: { id: true, isActive: true },
          }),
          tx.inventoryItem.findMany({
            where: {
              id: { in: normalizedItems.map((item) => item.inventoryItemId) },
              tenantId,
            },
            select: { id: true },
          }),
        ]);

        if (!source || !destination) {
          throw new NotFoundException(
            'Source or destination warehouse not found',
          );
        }
        if (!source.isActive || !destination.isActive) {
          throw new BadRequestException(
            'Inactive warehouses cannot be used for new transfers',
          );
        }
        if (inventoryItems.length !== normalizedItems.length) {
          throw new NotFoundException(
            'One or more inventory items were not found in this tenant',
          );
        }

        const created = await tx.warehouseTransfer.create({
          data: {
            tenantId,
            sourceWarehouseId,
            destinationWarehouseId,
            createdById: userId,
            idempotencyKey,
            requestHash,
            note,
            Items: {
              create: normalizedItems.map((item) => ({
                inventoryItemId: item.inventoryItemId,
                quantity: item.quantity,
              })),
            },
          },
          include: transferDetailInclude,
        });

        await this.writeOutbox(
          tx,
          tenantId,
          DOMAIN_EVENTS.WAREHOUSE_TRANSFER_CREATED,
          {
            transferId: created.id,
            tenantId,
          },
        );
        return created;
      });
      return transfer;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const concurrentTransfer =
          await this.prisma.warehouseTransfer.findUnique({
            where: {
              tenantId_idempotencyKey: { tenantId, idempotencyKey },
            },
            include: transferDetailInclude,
          });
        if (concurrentTransfer) {
          return this.replayOrConflict(concurrentTransfer, requestHash);
        }
      }
      throw error;
    }
  }

  async findAll(tenantId: string, skip = 0, take = 20) {
    const safeSkip = Number.isSafeInteger(skip) && skip > 0 ? skip : 0;
    const safeTake =
      Number.isSafeInteger(take) && take > 0 ? Math.min(take, 100) : 20;
    const where = { tenantId };
    const [data, total] = await Promise.all([
      this.prisma.warehouseTransfer.findMany({
        where,
        include: transferSummaryInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: safeSkip,
        take: safeTake,
      }),
      this.prisma.warehouseTransfer.count({ where }),
    ]);
    return {
      data,
      pagination: {
        total,
        skip: safeSkip,
        take: safeTake,
        pages: Math.ceil(total / safeTake),
      },
    };
  }

  async findOne(tenantId: string, transferId: string) {
    const transfer = await this.prisma.warehouseTransfer.findFirst({
      where: { id: transferId, tenantId },
      include: transferDetailInclude,
    });
    if (!transfer) {
      throw new NotFoundException('Warehouse transfer not found');
    }
    return transfer;
  }

  async ship(tenantId: string, transferId: string, userId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockTransfer(tx, tenantId, transferId);
        const transfer = await tx.warehouseTransfer.findFirst({
          where: { id: transferId, tenantId },
          include: { Items: true },
        });
        if (!transfer) {
          throw new NotFoundException('Warehouse transfer not found');
        }
        if (
          transfer.status === WarehouseTransferStatus.IN_TRANSIT ||
          transfer.status === WarehouseTransferStatus.PARTIALLY_RECEIVED ||
          transfer.status === WarehouseTransferStatus.RECEIVED
        ) {
          return this.findOneInTransaction(tx, tenantId, transferId);
        }
        if (transfer.status !== WarehouseTransferStatus.PENDING) {
          throw new BadRequestException(
            `Cannot ship a transfer while in ${transfer.status}`,
          );
        }

        const inventoryItemIds = transfer.Items.map(
          (item) => item.inventoryItemId,
        ).sort();
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "InventoryStock"
          WHERE "warehouseId" = ${transfer.sourceWarehouseId}
            AND "inventoryItemId" IN (${Prisma.join(inventoryItemIds)})
          ORDER BY "inventoryItemId"
          FOR UPDATE
        `;
        const stocks = await tx.inventoryStock.findMany({
          where: {
            warehouseId: transfer.sourceWarehouseId,
            inventoryItemId: { in: inventoryItemIds },
          },
        });
        const stocksByItemId = new Map(
          stocks.map((stock) => [stock.inventoryItemId, stock]),
        );

        for (const item of transfer.Items) {
          await this.costing.lockItem(tx, tenantId, item.inventoryItemId);
          const stock = stocksByItemId.get(item.inventoryItemId);
          if (!stock || stock.quantity < item.quantity) {
            throw new BadRequestException(
              `Insufficient source stock for inventory item ${item.inventoryItemId}`,
            );
          }
          const updated = await tx.inventoryStock.updateMany({
            where: { id: stock.id, quantity: { gte: item.quantity } },
            data: {
              quantity: { decrement: item.quantity },
              updatedAt: new Date(),
            },
          });
          if (updated.count !== 1) {
            throw new BadRequestException(
              `Insufficient source stock for inventory item ${item.inventoryItemId}`,
            );
          }
          const movement = await tx.inventoryMovement.create({
            data: {
              tenantId,
              warehouseId: transfer.sourceWarehouseId,
              inventoryItemId: item.inventoryItemId,
              type: InventoryMovementType.TRANSFER,
              quantity: item.quantity,
              beforeQuantity: stock.quantity,
              afterQuantity: stock.quantity - item.quantity,
              note:
                transfer.note ?? `Warehouse transfer ${transfer.id} shipped`,
              createdById: userId,
              referenceType: 'WAREHOUSE_TRANSFER_SHIPMENT',
              referenceId: transfer.id,
            },
          });
          await this.costing.issue(tx, {
            tenantId,
            inventoryItemId: item.inventoryItemId,
            warehouseId: transfer.sourceWarehouseId,
            quantity: item.quantity,
            movementId: movement.id,
          });
        }

        const shippedAt = new Date();
        const shipped = await tx.warehouseTransfer.updateMany({
          where: {
            id: transferId,
            tenantId,
            status: WarehouseTransferStatus.PENDING,
          },
          data: {
            status: WarehouseTransferStatus.IN_TRANSIT,
            shippedAt,
            shippedById: userId,
          },
        });
        if (shipped.count !== 1) {
          throw new ConflictException(
            'Warehouse transfer changed while it was being shipped',
          );
        }
        await this.writeOutbox(
          tx,
          tenantId,
          DOMAIN_EVENTS.WAREHOUSE_TRANSFER_SHIPPED,
          { transferId, tenantId },
        );
        return this.findOneInTransaction(tx, tenantId, transferId);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async receive(
    tenantId: string,
    transferId: string,
    userId: string,
    idempotencyKey: string,
    dto: ReceiveWarehouseTransferDto,
  ) {
    this.assertIdempotencyKey(idempotencyKey);
    if (
      !Array.isArray(dto.items) ||
      dto.items.length < 1 ||
      dto.items.length > 100
    ) {
      throw new BadRequestException(
        'A receipt must contain between 1 and 100 transfer items',
      );
    }

    const normalizedItems = dto.items.map((item) => ({
      transferItemId: item.transferItemId.trim(),
      receivedQuantity: item.receivedQuantity,
    }));
    const itemIds = new Set<string>();
    for (const item of normalizedItems) {
      if (!item.transferItemId) {
        throw new BadRequestException('Transfer item id is required');
      }
      if (
        !Number.isFinite(item.receivedQuantity) ||
        item.receivedQuantity <= 0
      ) {
        throw new BadRequestException(
          'Received quantity must be a finite positive number',
        );
      }
      if (itemIds.has(item.transferItemId)) {
        throw new BadRequestException(
          'A transfer item may only appear once per receipt',
        );
      }
      itemIds.add(item.transferItemId);
    }
    normalizedItems.sort((a, b) =>
      a.transferItemId.localeCompare(b.transferItemId),
    );
    const note = dto.note?.trim() || null;
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ items: normalizedItems, note }))
      .digest('hex');

    return this.prisma.$transaction(
      async (tx) => {
        await this.lockTransfer(tx, tenantId, transferId);
        const transfer = await tx.warehouseTransfer.findFirst({
          where: { id: transferId, tenantId },
          include: { Items: true },
        });
        if (!transfer) {
          throw new NotFoundException('Warehouse transfer not found');
        }

        const existingReceipt = await tx.warehouseTransferReceipt.findUnique({
          where: {
            transferId_idempotencyKey: { transferId, idempotencyKey },
          },
          include: { Items: true },
        });
        if (existingReceipt) {
          return this.replayOrConflict(existingReceipt, requestHash);
        }

        if (
          transfer.status !== WarehouseTransferStatus.IN_TRANSIT &&
          transfer.status !== WarehouseTransferStatus.PARTIALLY_RECEIVED
        ) {
          throw new BadRequestException(
            `Cannot receive a transfer while in ${transfer.status}`,
          );
        }

        const transferItemsById = new Map(
          transfer.Items.map((item) => [item.id, item]),
        );
        const plannedItems = normalizedItems.map((receiptItem) => {
          const transferItem = transferItemsById.get(
            receiptItem.transferItemId,
          );
          if (!transferItem) {
            throw new BadRequestException(
              'Receipt item does not belong to this transfer',
            );
          }
          const nextReceived =
            transferItem.receivedQuantity + receiptItem.receivedQuantity;
          if (nextReceived - transferItem.quantity > 1e-9) {
            throw new BadRequestException(
              'Cannot receive more than the quantity shipped',
            );
          }
          return {
            transferItem,
            delta:
              Math.min(nextReceived, transferItem.quantity) -
              transferItem.receivedQuantity,
            nextReceived: Math.min(nextReceived, transferItem.quantity),
          };
        });
        const receiptStatus = transfer.Items.every((item) => {
          const planned = plannedItems.find(
            ({ transferItem }) => transferItem.id === item.id,
          );
          const receivedQuantity =
            planned?.nextReceived ?? item.receivedQuantity;
          return receivedQuantity >= item.quantity - 1e-9;
        })
          ? WarehouseTransferStatus.RECEIVED
          : WarehouseTransferStatus.PARTIALLY_RECEIVED;

        const receipt = await tx.warehouseTransferReceipt.create({
          data: {
            tenantId,
            transferId,
            createdById: userId,
            idempotencyKey,
            requestHash,
            note,
            Items: {
              create: plannedItems.map(({ transferItem, delta }) => ({
                tenantId,
                transferItemId: transferItem.id,
                inventoryItemId: transferItem.inventoryItemId,
                receivedQuantity: delta,
              })),
            },
          },
          include: { Items: true },
        });

        for (const { transferItem, delta, nextReceived } of plannedItems) {
          await this.costing.lockItem(
            tx,
            tenantId,
            transferItem.inventoryItemId,
          );
          const updatedItem = await tx.warehouseTransferItem.updateMany({
            where: { id: transferItem.id, transferId },
            data: { receivedQuantity: nextReceived },
          });
          if (updatedItem.count !== 1) {
            throw new ConflictException(
              'Transfer item changed during receipt processing',
            );
          }
          const stock = await tx.inventoryStock.upsert({
            where: {
              warehouseId_inventoryItemId: {
                warehouseId: transfer.destinationWarehouseId,
                inventoryItemId: transferItem.inventoryItemId,
              },
            },
            create: {
              warehouseId: transfer.destinationWarehouseId,
              inventoryItemId: transferItem.inventoryItemId,
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
              warehouseId: transfer.destinationWarehouseId,
              inventoryItemId: transferItem.inventoryItemId,
              type: InventoryMovementType.TRANSFER,
              quantity: delta,
              beforeQuantity: stock.quantity - delta,
              afterQuantity: stock.quantity,
              note: note ?? `Warehouse transfer ${transfer.id} received`,
              createdById: userId,
              referenceType: 'WAREHOUSE_TRANSFER_RECEIPT',
              referenceId: receipt.id,
            },
          });
          const sourceMovement = await tx.inventoryMovement.findFirst({
            where: {
              tenantId,
              warehouseId: transfer.sourceWarehouseId,
              inventoryItemId: transferItem.inventoryItemId,
              referenceType: 'WAREHOUSE_TRANSFER_SHIPMENT',
              referenceId: transfer.id,
            },
            select: { id: true },
          });
          if (!sourceMovement) {
            throw new BadRequestException(
              'Transfer shipment movement is missing',
            );
          }
          await this.costing.receiveTransfer(tx, {
            tenantId,
            inventoryItemId: transferItem.inventoryItemId,
            warehouseId: transfer.destinationWarehouseId,
            quantity: delta,
            alreadyReceived: transferItem.receivedQuantity,
            sourceMovementId: sourceMovement.id,
            movementId: movement.id,
            sourceReferenceId: receipt.id,
          });
        }

        const updatedTransfer = await tx.warehouseTransfer.updateMany({
          where: {
            id: transferId,
            tenantId,
            status: transfer.status,
          },
          data: {
            status: receiptStatus,
            receivedAt:
              receiptStatus === WarehouseTransferStatus.RECEIVED
                ? new Date()
                : undefined,
          },
        });
        if (updatedTransfer.count !== 1) {
          throw new ConflictException(
            'Warehouse transfer changed while it was being received',
          );
        }
        const eventType =
          receiptStatus === WarehouseTransferStatus.RECEIVED
            ? DOMAIN_EVENTS.WAREHOUSE_TRANSFER_RECEIVED
            : DOMAIN_EVENTS.WAREHOUSE_TRANSFER_PARTIALLY_RECEIVED;
        await this.writeOutbox(tx, tenantId, eventType, {
          transferId,
          receiptId: receipt.id,
          tenantId,
        });
        return receipt;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async cancel(tenantId: string, transferId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockTransfer(tx, tenantId, transferId);
        const transfer = await tx.warehouseTransfer.findFirst({
          where: { id: transferId, tenantId },
        });
        if (!transfer) {
          throw new NotFoundException('Warehouse transfer not found');
        }
        if (transfer.status === WarehouseTransferStatus.CANCELLED) {
          return this.findOneInTransaction(tx, tenantId, transferId);
        }
        if (transfer.status !== WarehouseTransferStatus.PENDING) {
          throw new BadRequestException(
            'Only pending transfers can be cancelled',
          );
        }

        const cancelled = await tx.warehouseTransfer.updateMany({
          where: {
            id: transferId,
            tenantId,
            status: WarehouseTransferStatus.PENDING,
          },
          data: { status: WarehouseTransferStatus.CANCELLED },
        });
        if (cancelled.count !== 1) {
          throw new ConflictException(
            'Warehouse transfer changed while it was being cancelled',
          );
        }
        await this.writeOutbox(
          tx,
          tenantId,
          DOMAIN_EVENTS.WAREHOUSE_TRANSFER_CANCELLED,
          { transferId, tenantId },
        );
        return this.findOneInTransaction(tx, tenantId, transferId);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  private async lockTransfer(
    tx: Prisma.TransactionClient,
    tenantId: string,
    transferId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "WarehouseTransfer"
      WHERE "id" = ${transferId} AND "tenantId" = ${tenantId}
      FOR UPDATE
    `;
    if (rows.length !== 1) {
      throw new NotFoundException('Warehouse transfer not found');
    }
  }

  private async findOneInTransaction(
    tx: Prisma.TransactionClient,
    tenantId: string,
    transferId: string,
  ): Promise<
    Prisma.WarehouseTransferGetPayload<{
      include: typeof transferDetailInclude;
    }>
  > {
    const transfer = await tx.warehouseTransfer.findFirst({
      where: { id: transferId, tenantId },
      include: transferDetailInclude,
    });
    if (!transfer) {
      throw new NotFoundException('Warehouse transfer not found');
    }
    return transfer;
  }

  private async writeOutbox(
    tx: Prisma.TransactionClient,
    tenantId: string,
    type: DomainEventName,
    payload: Record<string, string>,
  ) {
    await tx.outboxEvent.create({
      data: {
        tenantId,
        type,
        payload: JSON.stringify({
          type,
          payload,
          occurredAt: new Date(),
        }),
        status: 'PENDING',
      },
    });
  }

  private replayOrConflict<T extends { requestHash: string }>(
    existing: T,
    requestHash: string,
  ): T {
    if (existing.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency-Key was already used with a different transfer request',
      );
    }
    return existing;
  }

  private assertIdempotencyKey(idempotencyKey: string) {
    if (
      !idempotencyKey ||
      idempotencyKey.length > 128 ||
      !/^[\x21-\x7e]+$/.test(idempotencyKey)
    ) {
      throw new BadRequestException(
        'A valid Idempotency-Key header of 1 to 128 visible ASCII characters is required',
      );
    }
  }
}
