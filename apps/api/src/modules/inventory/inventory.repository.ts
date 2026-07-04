import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';
import {
  InventoryItemAggregate,
  InventoryItemProps,
} from './domain/inventory-item.aggregate';
import { StockInDto } from './dto/stock-in.dto';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { WasteDto } from './dto/waste.dto';
import { InventoryItemType, Prisma } from '@prisma/client';

@Injectable()
export class InventoryRepository extends BaseRepository {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async findAll(tenantId: string) {
    return this.prisma.inventoryItem.findMany({
      where: this.buildTenantFilter(tenantId),
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!item) {
      return null;
    }

    return InventoryItemAggregate.create({
      id: item.id,
      tenantId: item.tenantId,
      code: item.code,
      name: item.name,
      description: item.description,
      unit: item.unit,
      type: item.type,
      isActive: item.isActive,
      createdAt: item.createdAt,
    });
  }

  async create(item: InventoryItemProps) {
    const persisted = await this.prisma.inventoryItem.create({
      data: {
        id: item.id,
        code: item.code,
        name: item.name,
        description: item.description ?? undefined,
        unit: item.unit ?? undefined,
        type: item.type,
        tenantId: item.tenantId,
        isActive: item.isActive,
      },
    });

    return InventoryItemAggregate.create({
      ...item,
      createdAt: persisted.createdAt,
    });
  }

  async stockIn(tenantId: string, dto: StockInDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const stock = await tx.inventoryStock.findFirst({
        where: {
          warehouseId: dto.warehouseId,
          inventoryItemId: dto.inventoryItemId,
        },
      });

      const beforeQty = stock?.quantity ?? 0;

      if (stock) {
        await tx.inventoryStock.update({
          where: { id: stock.id },
          data: { quantity: { increment: dto.quantity } },
        });
      } else {
        await tx.inventoryStock.create({
          data: {
            warehouseId: dto.warehouseId,
            inventoryItemId: dto.inventoryItemId,
            quantity: dto.quantity,
            updatedAt: new Date(),
          },
        });
      }

      return tx.inventoryMovement.create({
        data: {
          tenantId,
          warehouseId: dto.warehouseId,
          inventoryItemId: dto.inventoryItemId,
          type: 'STOCK_IN',
          quantity: dto.quantity,
          beforeQuantity: beforeQty,
          afterQuantity: beforeQty + dto.quantity,
          note: dto.note,
          createdById: userId,
        },
      });
    });
  }

  async adjustment(tenantId: string, dto: StockAdjustmentDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const stock = await tx.inventoryStock.findFirst({
        where: {
          warehouseId: dto.warehouseId,
          inventoryItemId: dto.inventoryItemId,
        },
      });

      if (!stock) {
        throw new BadRequestException('Stock not found');
      }

      const beforeQty = stock.quantity;
      const afterQty = beforeQty + dto.quantity;

      if (afterQty < 0) {
        throw new BadRequestException('Insufficient stock');
      }

      await tx.inventoryStock.update({
        where: { id: stock.id },
        data: { quantity: afterQty },
      });

      return tx.inventoryMovement.create({
        data: {
          tenantId,
          warehouseId: dto.warehouseId,
          inventoryItemId: dto.inventoryItemId,
          type: 'ADJUSTMENT',
          quantity: dto.quantity,
          beforeQuantity: beforeQty,
          afterQuantity: afterQty,
          note: dto.note,
          createdById: userId,
        },
      });
    });
  }

  async waste(tenantId: string, dto: WasteDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const stock = await tx.inventoryStock.findFirst({
        where: {
          warehouseId: dto.warehouseId,
          inventoryItemId: dto.inventoryItemId,
        },
      });

      if (!stock) {
        throw new BadRequestException('Stock not found');
      }

      if (stock.quantity < dto.quantity) {
        throw new BadRequestException('Insufficient stock');
      }

      const beforeQty = stock.quantity;
      const afterQty = beforeQty - dto.quantity;

      await tx.inventoryStock.update({
        where: { id: stock.id },
        data: { quantity: afterQty },
      });

      return tx.inventoryMovement.create({
        data: {
          tenantId,
          warehouseId: dto.warehouseId,
          inventoryItemId: dto.inventoryItemId,
          type: 'WASTE',
          quantity: dto.quantity,
          beforeQuantity: beforeQty,
          afterQuantity: afterQty,
          note: dto.note,
          createdById: userId,
        },
      });
    });
  }

  async history(tenantId: string) {
    return this.prisma.inventoryMovement.findMany({
      where: { tenantId },
      include: {
        InventoryItem: true,
        Warehouse: true,
        User: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async historyByItem(tenantId: string, inventoryItemId: string) {
    return this.prisma.inventoryMovement.findMany({
      where: { tenantId, inventoryItemId },
      include: {
        InventoryItem: true,
        Warehouse: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listInventoryItems(tenantId: string, type?: InventoryItemType) {
    const where: Prisma.InventoryItemWhereInput = {
      tenantId,
    };

    if (type) {
      where.type = type;
    }

    return this.prisma.inventoryItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }
}
