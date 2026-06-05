import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';

import { StockInDto } from './dto/stock-in.dto';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { WasteDto } from './dto/waste.dto';

import { InventoryMovementType } from '@prisma/client';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

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
          where: {
            id: stock.id,
          },
          data: {
            quantity: {
              increment: dto.quantity,
            },
          },
        });
      } else {
        await tx.inventoryStock.create({
          data: {
            warehouseId: dto.warehouseId,
            inventoryItemId: dto.inventoryItemId,
            quantity: dto.quantity,
          },
        });
      }

      return tx.inventoryMovement.create({
        data: {
          tenantId,

          warehouseId: dto.warehouseId,

          inventoryItemId: dto.inventoryItemId,

          type: InventoryMovementType.STOCK_IN,

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
        where: {
          id: stock.id,
        },
        data: {
          quantity: afterQty,
        },
      });

      return tx.inventoryMovement.create({
        data: {
          tenantId,

          warehouseId: dto.warehouseId,

          inventoryItemId: dto.inventoryItemId,

          type: InventoryMovementType.ADJUSTMENT,

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
        where: {
          id: stock.id,
        },
        data: {
          quantity: afterQty,
        },
      });

      return tx.inventoryMovement.create({
        data: {
          tenantId,

          warehouseId: dto.warehouseId,

          inventoryItemId: dto.inventoryItemId,

          type: InventoryMovementType.WASTE,

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
      where: {
        tenantId,
      },

      include: {
        inventoryItem: true,
        warehouse: true,
        createdBy: true,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async historyByItem(tenantId: string, inventoryItemId: string) {
    return this.prisma.inventoryMovement.findMany({
      where: {
        tenantId,
        inventoryItemId,
      },

      include: {
        inventoryItem: true,
        warehouse: true,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
