import { Injectable, BadRequestException } from '@nestjs/common';

import { BusinessType, InventoryMovementType } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class FulfillmentService {
  constructor(private prisma: PrismaService) {}

  async processOrder(orderId: string, tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: {
        id: tenantId,
      },
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
        return true;
    }
  }

  private async processRetail(orderId: string, tenantId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findFirst({
        where: {
          id: orderId,
          tenantId,
        },

        include: {
          items: {
            include: {
              product: {
                include: {
                  inventoryItem: true,
                },
              },
            },
          },
        },
      });

      if (!order) {
        throw new BadRequestException('Order not found');
      }

      for (const item of order.items) {
        const inventoryItemId = item.product.inventoryItemId;

        if (!inventoryItemId) {
          continue;
        }

        const stock = await tx.inventoryStock.findFirst({
          where: {
            inventoryItemId,
          },
        });

        if (!stock) {
          throw new BadRequestException(
            `Stock not found for ${item.product.name}`,
          );
        }

        if (stock.quantity < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for ${item.product.name}`,
          );
        }

        await tx.inventoryStock.update({
          where: {
            id: stock.id,
          },

          data: {
            quantity: stock.quantity - item.quantity,
          },
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
        where: {
          id: orderId,
          tenantId,
        },

        include: {
          items: {
            include: {
              product: {
                include: {
                  recipe: {
                    include: {
                      items: {
                        include: {
                          ingredient: {
                            include: {
                              inventoryItem: true,
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

      for (const orderItem of order.items) {
        const recipe = orderItem.product.recipe;

        if (!recipe) {
          continue;
        }

        for (const recipeItem of recipe.items) {
          const usage = recipeItem.quantity * orderItem.quantity;

          const inventoryItemId = recipeItem.ingredient.inventoryItemId;

          const stock = await tx.inventoryStock.findFirst({
            where: {
              inventoryItemId,
            },
          });

          if (!stock) {
            throw new BadRequestException(
              `Stock not found for ingredient ${recipeItem.ingredient.name}`,
            );
          }

          if (stock.quantity < usage) {
            throw new BadRequestException(
              `Insufficient stock for ingredient ${recipeItem.ingredient.name}`,
            );
          }

          await tx.inventoryStock.update({
            where: {
              id: stock.id,
            },

            data: {
              quantity: stock.quantity - usage,
            },
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
