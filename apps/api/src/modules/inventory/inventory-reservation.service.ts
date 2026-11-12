import { BadRequestException, Injectable } from '@nestjs/common';

import {
  BusinessType,
  InventoryItemType,
  InventoryMovementType,
  ProductStockMode,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { resolveUnitConversionFactor } from '../ingredients/unit-conversion';
import { InventoryCostingService } from './inventory-costing.service';

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
    id: string;
    businessType: BusinessType;
  };
  outletId?: string | null;
  SalesOrderItem: {
    id: string;
    quantity: number;

    Product: {
      id: string;
      tenantId: string;
      name: string;
      isActive: boolean;
      stockMode: ProductStockMode;
      inventoryItemId?: string | null;

      InventoryItem?: {
        id: string;
        tenantId: string;
        type: InventoryItemType;
        isActive: boolean;
      } | null;

      Recipe?: {
        id: string;
        tenantId: string;
        revision: number;
        isActive: boolean;
        RecipeItem: {
          quantity: number;
          InventoryItem: {
            id: string;
            name: string;
            unit: string | null;
            tenantId: string;
            type: InventoryItemType;
            isActive: boolean;
          };
          unit: string | null;
        }[];
      } | null;
    };
  }[];
};

@Injectable()
export class InventoryReservationService {
  constructor(
    private prisma: PrismaService,
    private readonly costing: InventoryCostingService = new InventoryCostingService(),
  ) {}

  async reserveStock(orderId: string, tenantId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const [lockedOrder] = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "SalesOrder"
          WHERE "id" = ${orderId} AND "tenantId" = ${tenantId}
          FOR UPDATE
        `;
        if (!lockedOrder) {
          throw new BadRequestException('Order not found');
        }

        const existingReservation = await tx.inventoryMovement.findFirst({
          where: {
            tenantId,
            referenceId: orderId,
            referenceType: {
              in: [ACTIVE_RESERVATION_REF, COMMITTED_RESERVATION_REF],
            },
          },
        });

        if (existingReservation) {
          return { orderId, reserved: true };
        }

        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT product."id"
          FROM "Product" AS product
          JOIN "SalesOrderItem" AS order_item
            ON order_item."productId" = product."id"
          JOIN "SalesOrder" AS sales_order
            ON sales_order."id" = order_item."orderId"
            AND sales_order."tenantId" = product."tenantId"
          WHERE sales_order."id" = ${orderId}
            AND sales_order."tenantId" = ${tenantId}
          ORDER BY product."id"
          FOR UPDATE OF product
        `;
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT recipe."id"
          FROM "Recipe" AS recipe
          JOIN "Product" AS product
            ON product."id" = recipe."productId"
            AND product."tenantId" = recipe."tenantId"
          JOIN "SalesOrderItem" AS order_item
            ON order_item."productId" = product."id"
          JOIN "SalesOrder" AS sales_order
            ON sales_order."id" = order_item."orderId"
            AND sales_order."tenantId" = recipe."tenantId"
          WHERE sales_order."id" = ${orderId}
            AND sales_order."tenantId" = ${tenantId}
            AND recipe."isActive" = true
          ORDER BY recipe."id"
          FOR UPDATE OF recipe
        `;
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT inventory_item."id"
          FROM "InventoryItem" AS inventory_item
          JOIN "RecipeItem" AS recipe_item
            ON recipe_item."inventoryItemId" = inventory_item."id"
          JOIN "Recipe" AS recipe
            ON recipe."id" = recipe_item."recipeId"
          JOIN "Product" AS product
            ON product."id" = recipe."productId"
            AND product."tenantId" = recipe."tenantId"
          JOIN "SalesOrderItem" AS order_item
            ON order_item."productId" = product."id"
          JOIN "SalesOrder" AS sales_order
            ON sales_order."id" = order_item."orderId"
            AND sales_order."tenantId" = recipe."tenantId"
          WHERE sales_order."id" = ${orderId}
            AND sales_order."tenantId" = ${tenantId}
            AND recipe."isActive" = true
          ORDER BY inventory_item."id"
          FOR UPDATE OF inventory_item
        `;

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
                        tenantId: true,
                        type: true,
                        isActive: true,
                      },
                    },
                    Recipe: {
                      include: {
                        RecipeItem: {
                          include: {
                            InventoryItem: {
                              select: {
                                id: true,
                                name: true,
                                unit: true,
                                tenantId: true,
                                type: true,
                                isActive: true,
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
        for (const orderItem of order.SalesOrderItem) {
          if (orderItem.Product.tenantId !== order.Tenant.id) {
            throw new BadRequestException(
              `Product ${orderItem.Product.name} is outside this tenant`,
            );
          }
          if (!orderItem.Product.isActive) {
            throw new BadRequestException(
              `Product ${orderItem.Product.name} is inactive`,
            );
          }
        }

        const recipeSnapshots =
          order.Tenant.businessType === BusinessType.CAFE
            ? await this.ensureRecipeSnapshots(tx, order, tenantId)
            : new Map<
                string,
                Array<{
                  inventoryItemId: string;
                  quantity: number;
                  unit: string;
                  inventoryUnit: string;
                }>
              >();
        const recipeItemIds = [
          ...new Set(
            [...recipeSnapshots.values()]
              .flat()
              .map((item) => item.inventoryItemId),
          ),
        ];
        const [tenantConversions, inventoryConversions] = await Promise.all([
          tx.tenantUnitConversion.findMany({
            where: { tenantId },
            select: { fromUnit: true, toUnit: true, factor: true },
          }),
          recipeItemIds.length
            ? tx.inventoryUnitConversion.findMany({
                where: {
                  tenantId,
                  inventoryItemId: { in: recipeItemIds },
                },
                select: {
                  inventoryItemId: true,
                  fromUnit: true,
                  toUnit: true,
                  factor: true,
                },
              })
            : Promise.resolve([]),
        ]);
        const requirements = this.buildRequirements(
          order,
          recipeSnapshots,
          tenantConversions,
          inventoryConversions,
        );

        for (const requirement of requirements) {
          await this.reserveRequirement(tx, tenantId, order, requirement);
        }

        return { orderId, reserved: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async releaseReservation(
    orderId: string,
    tenantId: string,
    tx?: Prisma.TransactionClient,
  ) {
    if (tx) {
      return this.releaseReservationInTransaction(tx, orderId, tenantId);
    }

    return this.prisma.$transaction(
      (transaction) =>
        this.releaseReservationInTransaction(transaction, orderId, tenantId),
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  private async releaseReservationInTransaction(
    tx: Prisma.TransactionClient,
    orderId: string,
    tenantId: string,
  ) {
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

    if (claimed.count === 0) {
      return { orderId, released: false };
    }
    if (claimed.count !== reservations.length) {
      throw new BadRequestException('Reservation already processed');
    }

    for (const reservation of reservations) {
      if (!reservation.warehouseId) {
        throw new BadRequestException('Reservation has no warehouse');
      }
      const costAllocationCount =
        await tx.inventoryMovementCostAllocation.count({
          where: { movementId: reservation.id },
        });
      if (costAllocationCount > 0) {
        await this.costing.lockItem(tx, tenantId, reservation.inventoryItemId);
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

      const reversalMovement = await tx.inventoryMovement.create({
        data: {
          tenantId,
          warehouseId: reservation.warehouseId,
          inventoryItemId: reservation.inventoryItemId,
          type: InventoryMovementType.RETURN,
          unit: reservation.unit,
          referenceType: RELEASE_MOVEMENT_REF,
          referenceId: orderId,
          quantity: reservation.quantity,
          beforeQuantity,
          afterQuantity: beforeQuantity + reservation.quantity,
          note: 'Released order stock reservation',
        },
      });
      if (costAllocationCount > 0) {
        await this.costing.restore(tx, {
          tenantId,
          inventoryItemId: reservation.inventoryItemId,
          warehouseId: reservation.warehouseId,
          quantity: reservation.quantity,
          sourceMovementId: reservation.id,
          reversalMovementId: reversalMovement.id,
        });
      }
    }

    return { orderId, released: true };
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

        if (committed.count === 0) {
          return { orderId, committed: false };
        }
        if (committed.count !== reservations.length) {
          throw new BadRequestException('Reservation already processed');
        }
        for (const reservation of reservations) {
          const costAllocationCount =
            await tx.inventoryMovementCostAllocation.count({
              where: { movementId: reservation.id },
            });
          if (costAllocationCount === 0) {
            await this.costing.issue(tx, {
              tenantId,
              inventoryItemId: reservation.inventoryItemId,
              warehouseId: reservation.warehouseId,
              quantity: reservation.quantity,
              movementId: reservation.id,
            });
          }
        }

        return { orderId, committed: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  private async ensureRecipeSnapshots(
    tx: Prisma.TransactionClient,
    order: OrderWithRelations,
    tenantId: string,
  ) {
    const snapshots = new Map<
      string,
      Array<{
        inventoryItemId: string;
        quantity: number;
        unit: string;
        inventoryUnit: string;
      }>
    >();

    for (const orderItem of order.SalesOrderItem) {
      if (!orderItem.Product.isActive) {
        throw new BadRequestException(
          `Product ${orderItem.Product.name} is inactive`,
        );
      }
      if (orderItem.Product.stockMode !== ProductStockMode.RECIPE) continue;

      const existing = await tx.salesOrderRecipeSnapshot.findUnique({
        where: { orderItemId: orderItem.id },
        include: {
          Items: {
            select: {
              inventoryItemId: true,
              quantity: true,
              unit: true,
              inventoryUnit: true,
            },
          },
        },
      });
      if (existing) {
        if (
          existing.tenantId !== tenantId ||
          !existing.recipeId ||
          existing.Items.length === 0
        ) {
          throw new BadRequestException(
            `Product ${orderItem.Product.name} has an invalid recipe snapshot`,
          );
        }
        snapshots.set(
          orderItem.id,
          existing.Items.map((item) => ({
            inventoryItemId: item.inventoryItemId,
            quantity: item.quantity,
            unit: item.unit,
            inventoryUnit: item.inventoryUnit,
          })),
        );
        continue;
      }

      const recipe = orderItem.Product.Recipe?.isActive
        ? orderItem.Product.Recipe
        : null;
      if (
        !recipe ||
        recipe.tenantId !== tenantId ||
        recipe.RecipeItem.length === 0
      ) {
        throw new BadRequestException(
          `Product ${orderItem.Product.name} requires an active recipe before it can be confirmed`,
        );
      }
      for (const recipeItem of recipe.RecipeItem) {
        if (
          recipeItem.InventoryItem.tenantId !== tenantId ||
          recipeItem.InventoryItem.type !== InventoryItemType.INGREDIENT ||
          !recipeItem.InventoryItem.isActive ||
          !recipeItem.InventoryItem.unit?.trim()
        ) {
          throw new BadRequestException(
            `Recipe for ${orderItem.Product.name} contains an inactive, invalid, or cross-tenant ingredient`,
          );
        }
        if (!recipeItem.unit?.trim()) {
          throw new BadRequestException(
            `Recipe for ${orderItem.Product.name} contains an ingredient without a recipe unit`,
          );
        }
      }
      const snapshot = await tx.salesOrderRecipeSnapshot.create({
        data: {
          tenantId,
          orderItemId: orderItem.id,
          recipeId: recipe?.id ?? null,
          recipeRevision: recipe?.revision ?? null,
          Items: {
            create:
              recipe?.RecipeItem.map((item) => ({
                inventoryItemId: item.InventoryItem.id,
                ingredientName: item.InventoryItem.name,
                unit: item.unit ?? item.InventoryItem.unit ?? '',
                inventoryUnit: item.InventoryItem.unit ?? '',
                quantity: item.quantity,
              })) ?? [],
          },
        },
        include: {
          Items: {
            select: {
              inventoryItemId: true,
              quantity: true,
              unit: true,
              inventoryUnit: true,
            },
          },
        },
      });
      snapshots.set(
        orderItem.id,
        snapshot.Items.map((item) => ({
          inventoryItemId: item.inventoryItemId,
          quantity: item.quantity,
          unit: item.unit,
          inventoryUnit: item.inventoryUnit,
        })),
      );
    }

    return snapshots;
  }

  private buildRequirements(
    order: OrderWithRelations,
    snapshots: Map<
      string,
      Array<{
        inventoryItemId: string;
        quantity: number;
        unit: string;
        inventoryUnit: string;
      }>
    >,
    tenantConversions: {
      fromUnit: string;
      toUnit: string;
      factor: Prisma.Decimal;
    }[],
    inventoryConversions: {
      inventoryItemId: string;
      fromUnit: string;
      toUnit: string;
      factor: Prisma.Decimal;
    }[],
  ): StockRequirement[] {
    const requirements = new Map<string, StockRequirement>();

    const addRequirement = (
      inventoryItemId: string | null | undefined,
      quantity: number,
    ) => {
      if (!inventoryItemId || !Number.isFinite(quantity) || quantity <= 0) {
        throw new BadRequestException('Invalid inventory reservation quantity');
      }

      const current = requirements.get(inventoryItemId);
      requirements.set(inventoryItemId, {
        inventoryItemId,
        quantity: (current?.quantity ?? 0) + quantity,
      });
    };

    const businessType: BusinessType = order.Tenant.businessType;

    if (businessType === BusinessType.RETAIL) {
      for (const item of order.SalesOrderItem) {
        if (item.Product.stockMode === ProductStockMode.UNTRACKED) continue;
        if (item.Product.stockMode !== ProductStockMode.INVENTORY_ITEM) {
          throw new BadRequestException(
            `Product ${item.Product.name} uses a stock mode unavailable for retail`,
          );
        }
        const inventoryItem = item.Product.InventoryItem;
        if (
          !inventoryItem ||
          inventoryItem.tenantId !== order.Tenant.id ||
          inventoryItem.type !== InventoryItemType.PRODUCT ||
          !inventoryItem.isActive
        ) {
          throw new BadRequestException(
            `Product ${item.Product.name} has no active linked inventory item`,
          );
        }
        addRequirement(inventoryItem.id, item.quantity);
      }
    }

    if (businessType === BusinessType.CAFE) {
      for (const orderItem of order.SalesOrderItem) {
        if (
          orderItem.Product.stockMode === ProductStockMode.UNTRACKED ||
          orderItem.Product.stockMode === ProductStockMode.INVENTORY_ITEM
        ) {
          if (orderItem.Product.stockMode === ProductStockMode.INVENTORY_ITEM) {
            const inventoryItem = orderItem.Product.InventoryItem;
            if (
              !inventoryItem ||
              inventoryItem.tenantId !== order.Tenant.id ||
              inventoryItem.type !== InventoryItemType.PRODUCT ||
              !inventoryItem.isActive
            ) {
              throw new BadRequestException(
                `Product ${orderItem.Product.name} has no active linked inventory item`,
              );
            }
            addRequirement(inventoryItem.id, orderItem.quantity);
          }
          continue;
        }
        const recipeItems = snapshots.get(orderItem.id);
        if (
          orderItem.Product.stockMode === ProductStockMode.RECIPE &&
          (!recipeItems || recipeItems.length === 0)
        ) {
          throw new BadRequestException(
            `Product ${orderItem.Product.name} requires a valid recipe snapshot`,
          );
        }
        for (const recipeItem of recipeItems ?? []) {
          const conversions = [
            ...tenantConversions,
            ...inventoryConversions.filter(
              (rule) => rule.inventoryItemId === recipeItem.inventoryItemId,
            ),
          ];
          const factor = resolveUnitConversionFactor(
            recipeItem.unit,
            recipeItem.inventoryUnit,
            conversions,
          );
          if (!factor) {
            throw new BadRequestException(
              `No valid unit conversion from ${recipeItem.unit} to ${recipeItem.inventoryUnit} for ingredient ${recipeItem.inventoryItemId}`,
            );
          }
          addRequirement(
            recipeItem.inventoryItemId,
            factor.mul(recipeItem.quantity).mul(orderItem.quantity).toNumber(),
          );
        }
      }
    }

    if (
      businessType !== BusinessType.RETAIL &&
      businessType !== BusinessType.CAFE
    ) {
      for (const orderItem of order.SalesOrderItem) {
        if (orderItem.Product.stockMode === ProductStockMode.UNTRACKED)
          continue;
        if (orderItem.Product.stockMode !== ProductStockMode.INVENTORY_ITEM) {
          throw new BadRequestException(
            `Product ${orderItem.Product.name} uses an unsupported stock mode`,
          );
        }
        const inventoryItem = orderItem.Product.InventoryItem;
        if (
          !inventoryItem ||
          inventoryItem.tenantId !== order.Tenant.id ||
          inventoryItem.type !== InventoryItemType.PRODUCT ||
          !inventoryItem.isActive
        ) {
          throw new BadRequestException(
            `Product ${orderItem.Product.name} has no active linked inventory item`,
          );
        }
        addRequirement(inventoryItem.id, orderItem.quantity);
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
    const itemRows = await tx.$queryRaw<
      Array<{ id: string; name: string; unit: string | null }>
    >`
      SELECT "id", "name", "unit"
      FROM "InventoryItem"
      WHERE "id" = ${requirement.inventoryItemId}
        AND "tenantId" = ${tenantId}
        AND "isActive" = true
      FOR UPDATE
    `;
    if (itemRows.length === 0) {
      throw new BadRequestException(
        'Inventory item is missing, inactive, or outside this tenant',
      );
    }
    if (!itemRows[0].unit?.trim()) {
      throw new BadRequestException(
        `Inventory item ${itemRows[0].name} does not have a stock unit configured`,
      );
    }

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
    const availableQuantity = stocks.reduce(
      (total, stock) => total + stock.quantity,
      0,
    );
    if (availableQuantity + Number.EPSILON < remainingQuantity) {
      throw new BadRequestException(
        `Insufficient stock for ${itemRows[0].name}: required ${remainingQuantity} ${itemRows[0].unit}, available ${availableQuantity} ${itemRows[0].unit}`,
      );
    }

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
          unit: itemRows[0].unit,
          beforeQuantity: stock.quantity,
          afterQuantity: stock.quantity - quantityToReserve,
          note: 'Reserved stock for order',
        },
      });
      remainingQuantity -= quantityToReserve;
    }

    if (remainingQuantity > Number.EPSILON) {
      throw new BadRequestException(
        `Stock changed while reserving ${itemRows[0].name}`,
      );
    }
  }

  private getCommittedMovementType(businessType: BusinessType) {
    if (businessType === BusinessType.CAFE)
      return InventoryMovementType.CONSUMPTION;
    if (businessType === BusinessType.RETAIL) return InventoryMovementType.SALE;
    return InventoryMovementType.STOCK_OUT;
  }
}
