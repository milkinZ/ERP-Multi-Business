import { BadRequestException, Injectable } from '@nestjs/common';

import { BusinessType, InventoryMovementType } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class FulfillmentService {
  constructor(private readonly prisma: PrismaService) {}

  async processOrder(orderId: string, tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, businessType: true },
    });

    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    switch (tenant.businessType) {
      case BusinessType.RETAIL:
        return this.processRetail(orderId, tenantId);
      case BusinessType.CAFE:
        return this.processCafe(orderId, tenantId);
      default:
        // Other business types not yet implemented in legacy fulfillment.
        return true;
    }
  }

  private async processRetail(orderId: string, tenantId: string) {
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

      if (!order) throw new BadRequestException('Order not found');

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

  private async processCafe(orderId: string, tenantId: string) {
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

      if (!order) throw new BadRequestException('Order not found');

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
}
