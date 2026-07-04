import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';
import { InventoryMovementType, Prisma } from '@prisma/client';
import { ReservationAggregate } from './domain/reservation.aggregate';

export const ACTIVE_RESERVATION_REF = 'ORDER_RESERVATION';
export const COMMITTED_RESERVATION_REF = 'ORDER_RESERVATION_COMMITTED';
export const RELEASED_RESERVATION_REF = 'ORDER_RESERVATION_RELEASED';
export const EXPIRED_RESERVATION_REF = 'ORDER_RESERVATION_EXPIRED';
export const CANCELLED_RESERVATION_REF = 'ORDER_RESERVATION_CANCELLED';
export const RELEASE_MOVEMENT_REF = 'ORDER_RESERVATION_RELEASE';

type StockRequirement = {
  inventoryItemId: string;
  quantity: number;
};

type OrderWithRelations = {
  id: string;
  Tenant: {
    businessType: string;
  };
  outletId?: string | null;
  SalesOrderItem: {
    quantity: number;
    Product: {
      isActive: boolean;
      name: string;
      inventoryItemId?: string | null;
      InventoryItem?: {
        id: string;
      } | null;
      Recipe?: {
        RecipeItem: {
          quantity: number;
          Ingredient: {
            name: string;
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
export class ReservationRepository extends BaseRepository {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async transaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.$transaction(callback);
  }

  async reserveStock(orderId: string, tenantId: string) {
    return this.transaction(async (tx) => {
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

      const order = await this.findOrderWithRelations(tx, orderId, tenantId);
      if (!order) {
        throw new Error('Order not found');
      }

      ReservationAggregate.create(order.id, tenantId, order.outletId).reserve();

      const requirements = this.buildRequirements(order);

      for (const requirement of requirements) {
        await this.reserveRequirement(tx, tenantId, order, requirement);
      }

      return { orderId, reserved: true };
    });
  }

  async releaseReservation(orderId: string, tenantId: string) {
    return this.transaction(async (tx) => {
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

      const reservationIds = reservations.map((reservation) => reservation.id);

      const claimed = await tx.inventoryMovement.updateMany({
        where: {
          id: { in: reservationIds },
          tenantId,
          referenceType: ACTIVE_RESERVATION_REF,
        },
        data: { referenceType: RELEASED_RESERVATION_REF },
      });

      if (claimed.count !== reservations.length) {
        throw new Error('Reservation already processed');
      }

      for (const reservation of reservations) {
        if (!reservation.warehouseId) {
          throw new Error('Reservation has no warehouse');
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
            data: { quantity: { increment: reservation.quantity } },
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
    });
  }

  async cancelReservation(orderId: string, tenantId: string) {
    return this.transaction(async (tx) => {
      const reservations = await tx.inventoryMovement.findMany({
        where: {
          tenantId,
          referenceId: orderId,
          referenceType: ACTIVE_RESERVATION_REF,
        },
      });

      if (reservations.length === 0) {
        return { orderId, cancelled: false };
      }

      const reservationIds = reservations.map((reservation) => reservation.id);

      const claimed = await tx.inventoryMovement.updateMany({
        where: {
          id: { in: reservationIds },
          tenantId,
          referenceType: ACTIVE_RESERVATION_REF,
        },
        data: { referenceType: CANCELLED_RESERVATION_REF },
      });

      if (claimed.count !== reservations.length) {
        throw new Error('Reservation already processed');
      }

      for (const reservation of reservations) {
        if (!reservation.warehouseId) {
          throw new Error('Reservation has no warehouse');
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
            data: { quantity: { increment: reservation.quantity } },
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
            note: 'Cancelled order stock reservation',
          },
        });
      }

      return { orderId, cancelled: true };
    });
  }

  async commitReservation(orderId: string, tenantId: string) {
    return this.transaction(async (tx) => {
      const order = await this.findOrderWithRelations(tx, orderId, tenantId);
      if (!order) {
        throw new Error('Order not found');
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
        throw new Error('Reservation already processed');
      }

      return { orderId, committed: true };
    });
  }

  async expireReservations(cutoff: Date) {
    return this.transaction(async (tx) => {
      const reservations = await tx.inventoryMovement.findMany({
        where: {
          referenceType: ACTIVE_RESERVATION_REF,
          createdAt: { lt: cutoff },
        },
      });

      if (reservations.length === 0) {
        return 0;
      }

      const reservationIds = reservations.map((reservation) => reservation.id);

      const claimed = await tx.inventoryMovement.updateMany({
        where: {
          id: { in: reservationIds },
          referenceType: ACTIVE_RESERVATION_REF,
        },
        data: { referenceType: EXPIRED_RESERVATION_REF },
      });

      if (claimed.count !== reservations.length) {
        throw new Error('Reservation already processed');
      }

      for (const reservation of reservations) {
        if (!reservation.warehouseId) {
          throw new Error('Reservation has no warehouse');
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
            data: { quantity: { increment: reservation.quantity } },
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
            tenantId: reservation.tenantId,
            warehouseId: reservation.warehouseId,
            inventoryItemId: reservation.inventoryItemId,
            type: InventoryMovementType.RETURN,
            referenceType: RELEASE_MOVEMENT_REF,
            referenceId: reservation.referenceId,
            quantity: reservation.quantity,
            beforeQuantity,
            afterQuantity: beforeQuantity + reservation.quantity,
            note: 'Expired order stock reservation',
          },
        });
      }

      // Write an outbox event for each expired reservation so subscribers can react after transaction commit
      for (const reservation of reservations) {
        await tx.outboxEvent.create({
          data: {
            tenantId: reservation.tenantId,
            type: 'order.reservation.expired',
            payload: JSON.stringify({
              type: 'order.reservation.expired',
              payload: {
                orderId: reservation.referenceId,
                tenantId: reservation.tenantId,
              },
              occurredAt: new Date(),
            }),
            status: 'PENDING',
          },
        });
      }

      return reservations.length;
    });
  }

  private buildRequirements(order: OrderWithRelations) {
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

    const businessType = order.Tenant.businessType;

    if (businessType === 'RETAIL') {
      for (const item of order.SalesOrderItem) {
        if (!item.Product.isActive) {
          throw new Error(`Product ${item.Product.name} is inactive`);
        }

        addRequirement(
          item.Product.InventoryItem?.id ?? item.Product.inventoryItemId,
          item.quantity,
        );
      }
    }

    if (businessType === 'CAFE') {
      for (const orderItem of order.SalesOrderItem) {
        const recipe = orderItem.Product.Recipe;
        if (!recipe) continue;

        for (const recipeItem of recipe.RecipeItem) {
          const ingredient = recipeItem.Ingredient;
          if (!ingredient.InventoryItem?.id && !ingredient.inventoryItemId) {
            throw new Error(
              `Ingredient ${ingredient.name} is not linked to inventory`,
            );
          }

          addRequirement(
            ingredient.InventoryItem?.id ?? ingredient.inventoryItemId,
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
        throw new Error('Stock changed while reserving inventory');
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
      throw new Error('Insufficient stock for order reservation');
    }
  }

  private getCommittedMovementType(businessType: string) {
    if (businessType === 'CAFE') return InventoryMovementType.CONSUMPTION;
    if (businessType === 'RETAIL') return InventoryMovementType.SALE;
    return InventoryMovementType.STOCK_OUT;
  }

  private async findOrderWithRelations(
    tx: Prisma.TransactionClient,
    orderId: string,
    tenantId: string,
  ) {
    return tx.salesOrder.findFirst({
      where: { id: orderId, tenantId },
      include: {
        Tenant: true,
        SalesOrderItem: {
          include: {
            Product: {
              include: {
                InventoryItem: {
                  select: { id: true },
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
  }
}
