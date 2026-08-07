import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';
import {
  InventoryItemAggregate,
  InventoryItemProps,
} from './domain/inventory-item.aggregate';
import { BusinessType, InventoryMovementType } from '@prisma/client';
import { StockInDto } from './dto/stock-in.dto';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { WasteDto } from './dto/waste.dto';
import { InventoryItemType, Prisma } from '@prisma/client';

@Injectable()
export class InventoryRepository extends BaseRepository {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async resolveTenantBusinessType(tenantId: string): Promise<BusinessType> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        businessType: true,
      },
    });

    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    return tenant.businessType;
  }

  // --- Fulfillment persistence (owned by InventoryRepository) ---
  // Idempotent by SalesOrder.status === COMPLETED and only executes for PAID orders.
  async fulfillRetail(orderId: string, tenantId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findFirst({
        where: { id: orderId, tenantId },
        include: {
          SalesOrderItem: {
            include: {
              Product: {
                include: {
                  InventoryItem: true,
                },
              },
            },
          },
        },
      });

      if (!order) {
        throw new BadRequestException('Order not found');
      }

      if (order.status === 'COMPLETED') {
        return false;
      }

      if (order.status !== 'PAID') {
        throw new BadRequestException('Order must be PAID before fulfillment');
      }

      for (const item of order.SalesOrderItem) {
        const inventoryItemId =
          item.Product.InventoryItem?.id ?? item.Product.inventoryItemId;

        if (!inventoryItemId) continue;

        const stock = await tx.inventoryStock.findFirst({
          where: { inventoryItemId },
        });

        if (!stock) {
          throw new BadRequestException(
            `Stock not found for ${item.Product.name}`,
          );
        }

        if (stock.quantity < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for ${item.Product.name}`,
          );
        }

        await tx.inventoryStock.update({
          where: { id: stock.id },
          data: { quantity: stock.quantity - item.quantity },
        });

        await tx.inventoryMovement.create({
          data: {
            tenantId,
            inventoryItemId,
            warehouseId: stock.warehouseId,
            type: InventoryMovementType.SALE,
            quantity: item.quantity,
            beforeQuantity: stock.quantity,
            afterQuantity: stock.quantity - item.quantity,
            referenceType: 'ORDER',
            referenceId: order.id,
          },
        });
      }

      return true;
    });
  }

  async fulfillCafe(orderId: string, tenantId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findFirst({
        where: { id: orderId, tenantId },
        include: {
          SalesOrderItem: {
            include: {
              Product: {
                include: {
                  Recipe: {
                    include: {
                      RecipeItem: {
                        include: {
                          Ingredient: {
                            include: {
                              InventoryItem: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!order) {
        throw new BadRequestException('Order not found');
      }

      if (order.status === 'COMPLETED') {
        return false;
      }

      if (order.status !== 'PAID') {
        throw new BadRequestException('Order must be PAID before fulfillment');
      }

      for (const orderItem of order.SalesOrderItem) {
        const recipe = orderItem.Product.Recipe;
        if (!recipe) continue;

        for (const recipeItem of recipe.RecipeItem) {
          const usage = recipeItem.quantity * orderItem.quantity;

          const inventoryItemId = recipeItem.Ingredient.inventoryItemId;

          const stock = await tx.inventoryStock.findFirst({
            where: { inventoryItemId },
          });

          if (!stock) {
            throw new BadRequestException(
              `Stock not found for ingredient ${recipeItem.Ingredient.name}`,
            );
          }

          if (stock.quantity < usage) {
            throw new BadRequestException(
              `Insufficient stock for ingredient ${recipeItem.Ingredient.name}`,
            );
          }

          await tx.inventoryStock.update({
            where: { id: stock.id },
            data: { quantity: stock.quantity - usage },
          });

          await tx.inventoryMovement.create({
            data: {
              tenantId,
              inventoryItemId,
              warehouseId: stock.warehouseId,
              type: InventoryMovementType.CONSUMPTION,
              quantity: usage,
              beforeQuantity: stock.quantity,
              afterQuantity: stock.quantity - usage,
              referenceType: 'ORDER',
              referenceId: order.id,
            },
          });
        }
      }

      return true;
    });
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
