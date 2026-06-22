import { BadRequestException, Injectable } from '@nestjs/common';

import { BusinessType, InventoryMovementType, Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';

const ACTIVE_RESERVATION_REF = 'ORDER_RESERVATION';
const COMMITTED_RESERVATION_REF = 'ORDER_RESERVATION_COMMITTED';
const RELEASED_RESERVATION_REF = 'ORDER_RESERVATION_RELEASED';
const RELEASE_MOVEMENT_REF = 'ORDER_RESERVATION_RELEASE';

type StockRequirement = {
  inventoryItemId: string;
  quantity: number;
};

type OrderWithRelations = {
  id: string;
  Tenant: {
    businessType: BusinessType;
  };
  outletId?: string | null;
  SalesOrderItem: {
    quantity: number;

    Product: {
      inventoryItemId?: string | null;

      InventoryItem?: {
        id: string;
      } | null;

      Recipe?: {
        RecipeItem: {
          quantity: number;

          Ingredient: {
            inventoryItemId?: string | null;

            InventoryItem?: {
              id: string;
            } | null;
          };
        }[];
      } | null;
    };
  }[];
};

@Injectable()
export class InventoryReservationService {
  constructor(private prisma: PrismaService) {}

  async reserveStock(orderId: string, tenantId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const existingReservation = await tx.inventoryMovement.findFirst({
          where: {
            tenantId,
            referenceId: orderId,
            referenceType: ACTIVE_RESERVATION_REF,
          },
        });

        if (existingReservation) {
          return { orderId, reserved: true };
        }

        const order = await tx.salesOrder.findFirst({
          where: { id: orderId, tenantId },
          include: {
            Tenant: true,
            SalesOrderItem: {
              include: {
                Product: {
                  include: {
                    InventoryItem: {
                      select: {
                        id: true,
                      },
                    },
                    Recipe: {
                      include: {
                        RecipeItem: {
                          include: {
                            Ingredient: {
                              include: {
                                InventoryItem: {
                                  select: { id: true },
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
          },
        });

        if (!order) {
          throw new BadRequestException('Order not found');
        }

        const requirements = this.buildRequirements(order);

        for (const requirement of requirements) {
          await this.reserveRequirement(tx, tenantId, order, requirement);
        }

        return { orderId, reserved: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async releaseReservation(orderId: string, tenantId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const reservations = await tx.inventoryMovement.findMany({
          where: {
            tenantId,
            referenceId: orderId,
            referenceType: ACTIVE_RESERVATION_REF,
          },
        });

        if (reservations.length === 0) {
          return { orderId, released: false };
        }

        const reservationIds = reservations.map((r) => r.id);

        const claimed = await tx.inventoryMovement.updateMany({
          where: {
            id: { in: reservationIds },
            tenantId,
            referenceType: ACTIVE_RESERVATION_REF,
          },
          data: { referenceType: RELEASED_RESERVATION_REF },
        });

        if (claimed.count !== reservations.length) {
          throw new BadRequestException('Reservation already processed');
        }

        for (const reservation of reservations) {
          if (!reservation.warehouseId) {
            throw new BadRequestException('Reservation has no warehouse');
          }

          const stock = await tx.inventoryStock.findUnique({
            where: {
              warehouseId_inventoryItemId: {
                warehouseId: reservation.warehouseId,
                inventoryItemId: reservation.inventoryItemId,
              },
            },
          });

          const beforeQuantity = stock?.quantity ?? 0;

          if (stock) {
            await tx.inventoryStock.update({
              where: { id: stock.id },
              data: {
                quantity: { increment: reservation.quantity },
              },
            });
          } else {
            await tx.inventoryStock.create({
              data: {
                warehouseId: reservation.warehouseId,
                inventoryItemId: reservation.inventoryItemId,
                quantity: reservation.quantity,
                updatedAt: new Date(),
              },
            });
          }

          await tx.inventoryMovement.create({
            data: {
              tenantId,
              warehouseId: reservation.warehouseId,
              inventoryItemId: reservation.inventoryItemId,
              type: InventoryMovementType.RETURN,
              referenceType: RELEASE_MOVEMENT_REF,
              referenceId: orderId,
              quantity: reservation.quantity,
              beforeQuantity,
              afterQuantity: beforeQuantity + reservation.quantity,
              note: 'Released order stock reservation',
            },
          });
        }

        return { orderId, released: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async commitReservation(orderId: string, tenantId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const order = await tx.salesOrder.findFirst({
          where: { id: orderId, tenantId },
          include: { Tenant: true },
        });

        if (!order) {
          throw new BadRequestException('Order not found');
        }

        const reservations = await tx.inventoryMovement.findMany({
          where: {
            tenantId,
            referenceId: orderId,
            referenceType: ACTIVE_RESERVATION_REF,
          },
        });

        if (reservations.length === 0) {
          return { orderId, committed: false };
        }

        const committed = await tx.inventoryMovement.updateMany({
          where: {
            id: { in: reservations.map((r) => r.id) },
            tenantId,
            referenceType: ACTIVE_RESERVATION_REF,
          },
          data: {
            referenceType: COMMITTED_RESERVATION_REF,
            type: this.getCommittedMovementType(order.Tenant.businessType),
            note: 'Committed order stock reservation',
          },
        });

        if (committed.count !== reservations.length) {
          throw new BadRequestException('Reservation already processed');
        }

        return { orderId, committed: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private buildRequirements(order: OrderWithRelations): StockRequirement[] {
    const requirements = new Map<string, StockRequirement>();

    const addRequirement = (
      inventoryItemId: string | null | undefined,
      quantity: number,
    ) => {
      if (!inventoryItemId || quantity <= 0) return;

      const current = requirements.get(inventoryItemId);
      requirements.set(inventoryItemId, {
        inventoryItemId,
        quantity: (current?.quantity ?? 0) + quantity,
      });
    };

    const businessType: BusinessType = order.Tenant.businessType;

    if (businessType === BusinessType.RETAIL) {
      for (const item of order.SalesOrderItem) {
        addRequirement(
          item.Product.InventoryItem?.id ?? item.Product.inventoryItemId,
          item.quantity,
        );
      }
    }

    if (businessType === BusinessType.CAFE) {
      for (const orderItem of order.SalesOrderItem) {
        const recipe = orderItem.Product.Recipe;
        if (!recipe) continue;

        for (const recipeItem of recipe.RecipeItem) {
          addRequirement(
            recipeItem.Ingredient.InventoryItem?.id ??
              recipeItem.Ingredient.inventoryItemId,
            recipeItem.quantity * orderItem.quantity,
          );
        }
      }
    }

    return [...requirements.values()];
  }

  private async reserveRequirement(
    tx: Prisma.TransactionClient,
    tenantId: string,
    order: OrderWithRelations,
    requirement: StockRequirement,
  ) {
    let remainingQuantity = requirement.quantity;

    const stocks = await tx.inventoryStock.findMany({
      where: {
        inventoryItemId: requirement.inventoryItemId,
        quantity: { gt: 0 },
        InventoryItem: { tenantId },
        Warehouse: {
          tenantId,
          ...(order.outletId
            ? {
                OR: [{ outletId: order.outletId }, { outletId: null }],
              }
            : {}),
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    for (const stock of stocks) {
      if (remainingQuantity <= 0) break;

      const quantityToReserve = Math.min(stock.quantity, remainingQuantity);

      const updated = await tx.inventoryStock.updateMany({
        where: {
          id: stock.id,
          quantity: { gte: quantityToReserve },
          InventoryItem: { tenantId },
          Warehouse: { tenantId },
        },
        data: {
          quantity: { decrement: quantityToReserve },
        },
      });

      if (updated.count !== 1) {
        throw new BadRequestException(
          'Stock changed while reserving inventory',
        );
      }

      await tx.inventoryMovement.create({
        data: {
          tenantId,
          warehouseId: stock.warehouseId,
          inventoryItemId: requirement.inventoryItemId,
          type: InventoryMovementType.STOCK_OUT,
          referenceType: ACTIVE_RESERVATION_REF,
          referenceId: order.id,
          quantity: quantityToReserve,
          beforeQuantity: stock.quantity,
          afterQuantity: stock.quantity - quantityToReserve,
          note: 'Reserved stock for order',
        },
      });

      remainingQuantity -= quantityToReserve;
    }

    if (remainingQuantity > 0) {
      throw new BadRequestException('Insufficient stock for order reservation');
    }
  }

  private getCommittedMovementType(businessType: BusinessType) {
    if (businessType === BusinessType.CAFE)
      return InventoryMovementType.CONSUMPTION;
    if (businessType === BusinessType.RETAIL) return InventoryMovementType.SALE;
    return InventoryMovementType.STOCK_OUT;
  }
}
