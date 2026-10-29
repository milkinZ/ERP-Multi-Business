import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryValuationMethod,
  MovingAverageScope,
  Prisma,
} from '@prisma/client';
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
import { InventoryHistoryListQueryDto } from './dto/inventory-history-list.dto';
import { InventoryItemListQueryDto } from './dto/inventory-item-list.dto';
import { ConfigureInventoryValuationDto } from './dto/configure-inventory-valuation.dto';
import { InventoryCostingService } from './inventory-costing.service';
import { ACTIVE_RESERVATION_REF } from './reservation.repository';
import { InventoryReorderRulesDto } from './dto/inventory-reorder-rules.dto';
import {
  InventoryReorderAction,
  InventoryReorderQuantityStrategy,
  InventoryReorderScope,
} from '@prisma/client';

const COMMITTED_RESERVATION_REF = 'ORDER_RESERVATION_COMMITTED';

@Injectable()
export class InventoryRepository extends BaseRepository {
  constructor(
    protected readonly prisma: PrismaService,
    private readonly costing: InventoryCostingService = new InventoryCostingService(),
  ) {
    super(prisma);
  }

  async getValuation(tenantId: string, inventoryItemId: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: inventoryItemId, tenantId },
      include: { InventoryStock: true },
    });
    if (!item) {
      throw new NotFoundException('Inventory item not found');
    }

    const activeReservations = await this.prisma.inventoryMovement.findMany({
      where: {
        tenantId,
        inventoryItemId,
        referenceType: ACTIVE_RESERVATION_REF,
      },
      select: { warehouseId: true, quantity: true },
    });
    const reservedQuantityByWarehouse = new Map<string, number>();
    for (const reservation of activeReservations) {
      const key = reservation.warehouseId ?? '';
      reservedQuantityByWarehouse.set(
        key,
        (reservedQuantityByWarehouse.get(key) ?? 0) + reservation.quantity,
      );
    }
    const stocks = item.InventoryStock.map((stock) => ({
      ...stock,
      quantity:
        stock.quantity +
        (reservedQuantityByWarehouse.get(stock.warehouseId ?? '') ?? 0),
    }));

    const layers = await this.prisma.inventoryCostLayer.findMany({
      where: { tenantId, inventoryItemId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const historicalFifo = await this.prisma.$transaction((tx) =>
      this.costing.reconstructHistoricalFifo(
        tx,
        tenantId,
        inventoryItemId,
        stocks,
      ),
    );
    const historicalMovingAverage = await this.prisma.$transaction((tx) =>
      this.costing.reconstructHistoricalMovingAverage(
        tx,
        tenantId,
        inventoryItemId,
        stocks,
      ),
    );
    const balances = stocks.map((stock) => {
      const historicalBalance = historicalFifo.find(
        (balance) => balance.warehouseId === stock.warehouseId,
      );
      const historicalAverageBalance = historicalMovingAverage.balances.find(
        (balance) => balance.warehouseId === stock.warehouseId,
      );
      const remainingLayers = layers.filter(
        (layer) => layer.warehouseId === stock.warehouseId,
      );
      const layerValue = remainingLayers.reduce(
        (value, layer) =>
          value.add(layer.remainingQuantity.mul(layer.unitCost)),
        new Prisma.Decimal(0),
      );
      const layerQuantity = remainingLayers.reduce(
        (quantity, layer) => quantity.add(layer.remainingQuantity),
        new Prisma.Decimal(0),
      );
      let inventoryValue: Prisma.Decimal | null = null;
      if (item.valuationMethod === InventoryValuationMethod.FIFO) {
        inventoryValue = layerQuantity.eq(stock.quantity) ? layerValue : null;
      } else if (
        item.valuationMethod ===
        InventoryValuationMethod.MOVING_WEIGHTED_AVERAGE
      ) {
        const unitCost =
          item.movingAverageScope === MovingAverageScope.PER_ITEM
            ? item.averageUnitCost
            : stock.averageUnitCost;
        inventoryValue = unitCost
          ? new Prisma.Decimal(stock.quantity).mul(unitCost)
          : stock.quantity === 0
            ? new Prisma.Decimal(0)
            : null;
      } else if (
        item.valuationMethod === InventoryValuationMethod.STANDARD_COST
      ) {
        inventoryValue = item.standardCost
          ? new Prisma.Decimal(stock.quantity).mul(item.standardCost)
          : stock.quantity === 0
            ? new Prisma.Decimal(0)
            : null;
      }
      return {
        warehouseId: stock.warehouseId,
        quantity: stock.quantity,
        inventoryValue,
        averageUnitCost:
          item.movingAverageScope === MovingAverageScope.PER_ITEM
            ? item.averageUnitCost
            : stock.averageUnitCost,
        fifoLayerQuantity: layerQuantity,
        fifoLayerValue: layerValue,
        traceableFifoQuantity:
          historicalBalance?.layers
            .filter((layer) => layer.unitCost !== null)
            .reduce(
              (total, layer) => total.add(layer.quantity),
              new Prisma.Decimal(0),
            ) ?? new Prisma.Decimal(0),
        fifoOpeningCostQuantity:
          historicalBalance?.openingCostQuantity ?? new Prisma.Decimal(0),
        fifoHistoryReconciled: historicalBalance?.reconciled ?? true,
        movingAverageWarehouseUnitCost:
          historicalAverageBalance?.warehouseAverageUnitCost ?? null,
        movingAverageWarehouseOpeningCostQuantity:
          historicalAverageBalance?.warehouseOpeningCostQuantity ??
          new Prisma.Decimal(Math.max(stock.quantity, 0)),
        movingAverageWarehouseHistoryReconciled:
          historicalAverageBalance?.warehouseReconciled ?? false,
        movingAverageItemOpeningCostQuantity:
          historicalAverageBalance?.itemOpeningCostQuantity ??
          new Prisma.Decimal(Math.max(stock.quantity, 0)),
      };
    });
    const isConfigured = Boolean(item.valuationMethod);
    const isFullyValued =
      isConfigured &&
      balances.every((balance) => balance.inventoryValue !== null);
    return {
      inventoryItemId: item.id,
      valuationMethod: item.valuationMethod,
      movingAverageScope: item.movingAverageScope,
      standardCost: item.standardCost,
      averageUnitCost: item.averageUnitCost,
      movingAverageItemUnitCost: historicalMovingAverage.itemAverageUnitCost,
      movingAverageItemHistoryReconciled:
        historicalMovingAverage.itemReconciled,
      lockedAt: item.valuationLockedAt,
      currencyCode: (
        await this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { currencyCode: true },
        })
      )?.currencyCode,
      status: !isConfigured
        ? 'SETUP_REQUIRED'
        : isFullyValued
          ? 'VALUED'
          : 'OPENING_COST_REQUIRED',
      totalQuantity: balances.reduce(
        (total, balance) => total + balance.quantity,
        0,
      ),
      totalValue: isFullyValued
        ? balances.reduce(
            (total, balance) =>
              total.add(balance.inventoryValue ?? new Prisma.Decimal(0)),
            new Prisma.Decimal(0),
          )
        : null,
      balances,
    };
  }

  async configureValuation(
    tenantId: string,
    inventoryItemId: string,
    dto: ConfigureInventoryValuationDto,
  ) {
    await this.prisma.$transaction(
      async (tx) => {
        const items = await tx.$queryRaw<
          Array<{
            id: string;
            valuationMethod: InventoryValuationMethod | null;
            valuationLockedAt: Date | null;
          }>
        >`
          SELECT "id", "valuationMethod", "valuationLockedAt"
          FROM "InventoryItem"
          WHERE "id" = ${inventoryItemId} AND "tenantId" = ${tenantId}
          FOR UPDATE
        `;
        const item = items[0];
        if (!item) {
          throw new NotFoundException('Inventory item not found');
        }
        const completedReservations = await tx.inventoryMovement.findMany({
          where: {
            tenantId,
            inventoryItemId,
            referenceType: 'ORDER_RESERVATION',
            referenceId: { not: null },
          },
          select: { id: true, referenceId: true },
        });
        const completedOrderIds = completedReservations
          .map((reservation) => reservation.referenceId)
          .filter((referenceId): referenceId is string => referenceId !== null);
        if (completedOrderIds.length > 0) {
          const completedOrders = await tx.salesOrder.findMany({
            where: {
              id: { in: completedOrderIds },
              tenantId,
              status: 'COMPLETED',
            },
            select: {
              id: true,
              Tenant: { select: { businessType: true } },
            },
          });
          for (const order of completedOrders) {
            const staleReservationIds = completedReservations
              .filter((reservation) => reservation.referenceId === order.id)
              .map((reservation) => reservation.id);
            await tx.inventoryMovement.updateMany({
              where: {
                id: { in: staleReservationIds },
                tenantId,
                referenceType: 'ORDER_RESERVATION',
              },
              data: {
                referenceType: COMMITTED_RESERVATION_REF,
                type:
                  order.Tenant.businessType === BusinessType.CAFE
                    ? InventoryMovementType.CONSUMPTION
                    : InventoryMovementType.SALE,
                note: 'Reconciled completed order stock reservation',
              },
            });
          }
        }
        if (item.valuationLockedAt) {
          throw new ConflictException(
            'Inventory valuation method is locked after the first costed stock transaction',
          );
        }
        const activeReservations = await tx.inventoryMovement.findMany({
          where: {
            tenantId,
            inventoryItemId,
            referenceType: 'ORDER_RESERVATION',
          },
          select: { warehouseId: true, quantity: true },
        });
        if (
          dto.method === InventoryValuationMethod.MOVING_WEIGHTED_AVERAGE &&
          !dto.movingAverageScope
        ) {
          throw new BadRequestException(
            'Choose a moving average scope for this inventory item',
          );
        }
        if (
          dto.method !== InventoryValuationMethod.MOVING_WEIGHTED_AVERAGE &&
          dto.movingAverageScope
        ) {
          throw new BadRequestException(
            'Moving average scope is only valid for moving weighted average',
          );
        }
        if (
          dto.method === InventoryValuationMethod.STANDARD_COST &&
          dto.standardCost === undefined
        ) {
          throw new BadRequestException(
            'Standard cost is required for standard cost valuation',
          );
        }
        if (
          dto.method !== InventoryValuationMethod.STANDARD_COST &&
          dto.standardCost !== undefined
        ) {
          throw new BadRequestException(
            'Standard cost is only valid for standard cost valuation',
          );
        }

        const stockRows = await tx.inventoryStock.findMany({
          where: { inventoryItemId },
          include: { Warehouse: { select: { tenantId: true } } },
        });
        const reservedQuantityByWarehouse = new Map<string, number>();
        for (const reservation of activeReservations) {
          const key = reservation.warehouseId ?? '';
          reservedQuantityByWarehouse.set(
            key,
            (reservedQuantityByWarehouse.get(key) ?? 0) + reservation.quantity,
          );
        }
        const stocks = stockRows.map((stock) => ({
          ...stock,
          quantity:
            stock.quantity +
            (reservedQuantityByWarehouse.get(stock.warehouseId ?? '') ?? 0),
        }));
        const activeStocks = stocks.filter((stock) => stock.quantity > 0);
        const costs = dto.openingCosts ?? [];
        const historicalFifo =
          dto.method === InventoryValuationMethod.FIFO
            ? await this.costing.reconstructHistoricalFifo(
                tx,
                tenantId,
                inventoryItemId,
                stocks,
              )
            : [];
        const historicalMovingAverage =
          dto.method === InventoryValuationMethod.MOVING_WEIGHTED_AVERAGE
            ? await this.costing.reconstructHistoricalMovingAverage(
                tx,
                tenantId,
                inventoryItemId,
                stocks,
              )
            : null;
        const fifoBalanceByWarehouse = new Map(
          historicalFifo.map((balance) => [balance.warehouseId ?? '', balance]),
        );
        const averageBalanceByWarehouse = new Map(
          historicalMovingAverage?.balances.map((balance) => [
            balance.warehouseId ?? '',
            balance,
          ]) ?? [],
        );
        if (
          dto.method === InventoryValuationMethod.STANDARD_COST &&
          costs.length > 0
        ) {
          throw new BadRequestException(
            'Opening costs are not used by standard cost valuation',
          );
        }
        const costByWarehouse = new Map<string, number>();
        for (const openingCost of costs) {
          const key = openingCost.warehouseId ?? '';
          if (costByWarehouse.has(key)) {
            throw new BadRequestException(
              'Opening cost must be provided once per warehouse',
            );
          }
          costByWarehouse.set(key, openingCost.unitCost);
        }
        for (const stock of stocks) {
          if (stock.Warehouse && stock.Warehouse.tenantId !== tenantId) {
            throw new BadRequestException(
              'Inventory stock references a warehouse outside this tenant',
            );
          }
        }

        const openingCostRequired = activeStocks.filter((stock) => {
          const warehouseKey = stock.warehouseId ?? '';
          const averageBalance = averageBalanceByWarehouse.get(warehouseKey);
          const quantity =
            dto.method === InventoryValuationMethod.FIFO
              ? (fifoBalanceByWarehouse
                  .get(warehouseKey)
                  ?.openingCostQuantity.toNumber() ?? stock.quantity)
              : dto.method === InventoryValuationMethod.MOVING_WEIGHTED_AVERAGE
                ? dto.movingAverageScope === MovingAverageScope.PER_ITEM
                  ? (averageBalance?.itemOpeningCostQuantity.toNumber() ??
                    stock.quantity)
                  : (averageBalance?.warehouseOpeningCostQuantity.toNumber() ??
                    stock.quantity)
                : stock.quantity;
          return (
            dto.method !== InventoryValuationMethod.STANDARD_COST &&
            quantity > 1e-9 &&
            !costByWarehouse.has(stock.warehouseId ?? '')
          );
        });
        if (openingCostRequired.length > 0) {
          throw new BadRequestException(
            dto.method === InventoryValuationMethod.FIFO
              ? 'Opening cost is required for untraceable remaining stock in each warehouse'
              : 'Opening cost is required for every warehouse with positive stock',
          );
        }
        if (
          costs.some(
            (cost) =>
              !activeStocks.some((stock) => {
                const key = stock.warehouseId ?? '';
                if (key !== (cost.warehouseId ?? '')) return false;
                if (dto.method === InventoryValuationMethod.FIFO) {
                  return (
                    fifoBalanceByWarehouse
                      .get(key)
                      ?.openingCostQuantity.gt(0) ?? true
                  );
                }
                if (
                  dto.method ===
                  InventoryValuationMethod.MOVING_WEIGHTED_AVERAGE
                ) {
                  const averageBalance = averageBalanceByWarehouse.get(key);
                  return dto.movingAverageScope === MovingAverageScope.PER_ITEM
                    ? (averageBalance?.itemOpeningCostQuantity.gt(0) ?? true)
                    : (averageBalance?.warehouseOpeningCostQuantity.gt(0) ??
                        true);
                }
                return true;
              }),
          )
        ) {
          throw new BadRequestException(
            'Opening cost references a warehouse without positive stock',
          );
        }

        await tx.inventoryCostLayer.deleteMany({
          where: {
            inventoryItemId,
            sourceType: {
              in: [
                'OPENING_BALANCE',
                'HISTORICAL_RECONSTRUCTION',
                'LEGACY_OPENING_COST',
              ],
            },
          },
        });
        await tx.inventoryStock.updateMany({
          where: { inventoryItemId },
          data: { averageUnitCost: null },
        });

        if (dto.method === InventoryValuationMethod.FIFO) {
          for (const balance of historicalFifo) {
            for (const layer of balance.layers) {
              const unitCost =
                layer.unitCost ??
                new Prisma.Decimal(
                  costByWarehouse.get(balance.warehouseId ?? '')!,
                );
              await tx.inventoryCostLayer.create({
                data: {
                  tenantId,
                  inventoryItemId,
                  warehouseId: balance.warehouseId,
                  sourceMovementId: layer.sourceMovementId,
                  sourceType:
                    layer.unitCost === null
                      ? 'LEGACY_OPENING_COST'
                      : 'HISTORICAL_RECONSTRUCTION',
                  sourceReferenceId: layer.sourceReferenceId,
                  receivedQuantity: layer.receivedQuantity,
                  remainingQuantity: layer.quantity,
                  unitCost,
                  createdAt: layer.createdAt,
                },
              });
            }
          }
        } else if (
          dto.method === InventoryValuationMethod.MOVING_WEIGHTED_AVERAGE
        ) {
          for (const stock of activeStocks) {
            if (dto.movingAverageScope === MovingAverageScope.PER_WAREHOUSE) {
              const historicalBalance = averageBalanceByWarehouse.get(
                stock.warehouseId ?? '',
              );
              const unitCost =
                historicalBalance?.warehouseReconciled &&
                historicalBalance.warehouseAverageUnitCost
                  ? historicalBalance.warehouseAverageUnitCost
                  : new Prisma.Decimal(
                      costByWarehouse.get(stock.warehouseId ?? '')!,
                    );
              await tx.inventoryStock.update({
                where: { id: stock.id },
                data: { averageUnitCost: unitCost },
              });
            }
          }
        }

        const totalQuantity = activeStocks.reduce(
          (total, stock) => total + stock.quantity,
          0,
        );
        const totalOpeningValue = activeStocks.reduce(
          (total, stock) =>
            total.add(
              new Prisma.Decimal(stock.quantity).mul(
                dto.method ===
                  InventoryValuationMethod.MOVING_WEIGHTED_AVERAGE &&
                  dto.movingAverageScope === MovingAverageScope.PER_ITEM &&
                  historicalMovingAverage?.itemReconciled
                  ? (historicalMovingAverage.itemAverageUnitCost ?? 0)
                  : dto.method ===
                        InventoryValuationMethod.MOVING_WEIGHTED_AVERAGE &&
                      dto.movingAverageScope ===
                        MovingAverageScope.PER_WAREHOUSE &&
                      averageBalanceByWarehouse.get(stock.warehouseId ?? '')
                        ?.warehouseReconciled
                    ? (averageBalanceByWarehouse.get(stock.warehouseId ?? '')
                        ?.warehouseAverageUnitCost ?? 0)
                    : (costByWarehouse.get(stock.warehouseId ?? '') ?? 0),
              ),
            ),
          new Prisma.Decimal(0),
        );
        const hasOpeningBalance = activeStocks.length > 0;
        await tx.inventoryItem.update({
          where: { id: inventoryItemId },
          data: {
            valuationMethod: dto.method,
            movingAverageScope: dto.movingAverageScope ?? null,
            standardCost: dto.standardCost ?? null,
            averageUnitCost:
              dto.method === InventoryValuationMethod.MOVING_WEIGHTED_AVERAGE &&
              dto.movingAverageScope === MovingAverageScope.PER_ITEM &&
              totalQuantity > 0
                ? totalOpeningValue.div(totalQuantity)
                : null,
            valuationLockedAt: hasOpeningBalance ? new Date() : null,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.getValuation(tenantId, inventoryItemId);
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
    return this.prisma.$transaction(
      async (tx) => {
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
          throw new BadRequestException(
            'Order must be PAID before fulfillment',
          );
        }

        const hasCommittedReservation = await tx.inventoryMovement.findFirst({
          where: {
            tenantId,
            referenceId: order.id,
            referenceType: COMMITTED_RESERVATION_REF,
          },
          select: { id: true },
        });

        for (const item of hasCommittedReservation
          ? []
          : order.SalesOrderItem) {
          const inventoryItemId =
            item.Product.InventoryItem?.id ?? item.Product.inventoryItemId;

          if (!inventoryItemId) continue;
          await this.costing.lockItem(tx, tenantId, inventoryItemId);

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

          const updatedStock = await tx.inventoryStock.updateMany({
            where: { id: stock.id, quantity: { gte: item.quantity } },
            data: {
              quantity: { decrement: item.quantity },
              updatedAt: new Date(),
            },
          });

          if (updatedStock.count !== 1) {
            throw new BadRequestException(
              `Insufficient stock for ${item.Product.name}`,
            );
          }

          const movement = await tx.inventoryMovement.create({
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
          await this.costing.issue(tx, {
            tenantId,
            inventoryItemId,
            warehouseId: stock.warehouseId,
            quantity: item.quantity,
            movementId: movement.id,
          });
        }

        const completed = await tx.salesOrder.updateMany({
          where: { id: order.id, tenantId, status: 'PAID' },
          data: { status: 'COMPLETED' },
        });

        return completed.count === 1;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async fulfillCafe(orderId: string, tenantId: string): Promise<boolean> {
    return this.prisma.$transaction(
      async (tx) => {
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
        });

        if (!order) {
          throw new BadRequestException('Order not found');
        }

        if (order.status === 'COMPLETED') {
          return false;
        }

        if (order.status !== 'PAID') {
          throw new BadRequestException(
            'Order must be PAID before fulfillment',
          );
        }

        const hasCommittedReservation = await tx.inventoryMovement.findFirst({
          where: {
            tenantId,
            referenceId: order.id,
            referenceType: COMMITTED_RESERVATION_REF,
          },
          select: { id: true },
        });

        for (const orderItem of hasCommittedReservation
          ? []
          : order.SalesOrderItem) {
          const recipe = orderItem.Product.Recipe;
          if (!recipe) continue;

          for (const recipeItem of recipe.RecipeItem) {
            const usage = recipeItem.quantity * orderItem.quantity;

            const inventoryItemId = recipeItem.InventoryItem.id;
            await this.costing.lockItem(tx, tenantId, inventoryItemId);

            const stock = await tx.inventoryStock.findFirst({
              where: { inventoryItemId },
            });

            if (!stock) {
              throw new BadRequestException(
                `Stock not found for ingredient ${recipeItem.InventoryItem.name}`,
              );
            }

            if (stock.quantity < usage) {
              throw new BadRequestException(
                `Insufficient stock for ingredient ${recipeItem.InventoryItem.name}`,
              );
            }

            const updatedStock = await tx.inventoryStock.updateMany({
              where: { id: stock.id, quantity: { gte: usage } },
              data: { quantity: { decrement: usage }, updatedAt: new Date() },
            });

            if (updatedStock.count !== 1) {
              throw new BadRequestException(
                `Insufficient stock for ingredient ${recipeItem.InventoryItem.name}`,
              );
            }

            const movement = await tx.inventoryMovement.create({
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
            await this.costing.issue(tx, {
              tenantId,
              inventoryItemId,
              warehouseId: stock.warehouseId,
              quantity: usage,
              movementId: movement.id,
            });
          }
        }

        const completed = await tx.salesOrder.updateMany({
          where: { id: order.id, tenantId, status: 'PAID' },
          data: { status: 'COMPLETED' },
        });

        return completed.count === 1;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
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
      await this.assertTenantStockScope(
        tx,
        tenantId,
        dto.inventoryItemId,
        dto.warehouseId,
      );
      await this.costing.lockItem(tx, tenantId, dto.inventoryItemId);
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

      const movement = await tx.inventoryMovement.create({
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
      await this.costing.receive(tx, {
        tenantId,
        inventoryItemId: dto.inventoryItemId,
        warehouseId: dto.warehouseId,
        quantity: dto.quantity,
        unitCost: dto.unitCost,
        sourceType: 'MANUAL_STOCK_IN',
        sourceReferenceId: movement.id,
        movementId: movement.id,
      });
      return tx.inventoryMovement.findUniqueOrThrow({
        where: { id: movement.id },
      });
    });
  }

  async adjustment(tenantId: string, dto: StockAdjustmentDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertTenantStockScope(
        tx,
        tenantId,
        dto.inventoryItemId,
        dto.warehouseId,
      );
      await this.costing.lockItem(tx, tenantId, dto.inventoryItemId);
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

      const movement = await tx.inventoryMovement.create({
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
      if (dto.quantity > 0) {
        await this.costing.receive(tx, {
          tenantId,
          inventoryItemId: dto.inventoryItemId,
          warehouseId: dto.warehouseId,
          quantity: dto.quantity,
          unitCost: dto.unitCost,
          sourceType: 'MANUAL_ADJUSTMENT',
          sourceReferenceId: movement.id,
          movementId: movement.id,
        });
      } else if (dto.quantity < 0) {
        await this.costing.issue(tx, {
          tenantId,
          inventoryItemId: dto.inventoryItemId,
          warehouseId: dto.warehouseId,
          quantity: Math.abs(dto.quantity),
          movementId: movement.id,
        });
      }
      return tx.inventoryMovement.findUniqueOrThrow({
        where: { id: movement.id },
      });
    });
  }

  async waste(tenantId: string, dto: WasteDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertTenantStockScope(
        tx,
        tenantId,
        dto.inventoryItemId,
        dto.warehouseId,
      );
      await this.costing.lockItem(tx, tenantId, dto.inventoryItemId);
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

      const movement = await tx.inventoryMovement.create({
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
      await this.costing.issue(tx, {
        tenantId,
        inventoryItemId: dto.inventoryItemId,
        warehouseId: dto.warehouseId,
        quantity: dto.quantity,
        movementId: movement.id,
      });
      return tx.inventoryMovement.findUniqueOrThrow({
        where: { id: movement.id },
      });
    });
  }

  private async assertTenantStockScope(
    tx: Prisma.TransactionClient,
    tenantId: string,
    inventoryItemId: string,
    warehouseId: string,
  ): Promise<void> {
    const [item, warehouse] = await Promise.all([
      tx.inventoryItem.findFirst({ where: { id: inventoryItemId, tenantId } }),
      tx.warehouse.findFirst({ where: { id: warehouseId, tenantId } }),
    ]);
    if (!item || !warehouse) {
      throw new BadRequestException('Inventory resource not found');
    }
    if (!warehouse.isActive) {
      throw new BadRequestException(
        'Inactive warehouses cannot receive new inventory movements',
      );
    }
  }

  async history(tenantId: string, query: InventoryHistoryListQueryDto) {
    return this.listMovementHistory(tenantId, query);
  }

  async historyByItem(
    tenantId: string,
    inventoryItemId: string,
    query: InventoryHistoryListQueryDto,
  ) {
    return this.listMovementHistory(tenantId, query, inventoryItemId);
  }

  private async listMovementHistory(
    tenantId: string,
    query: InventoryHistoryListQueryDto,
    inventoryItemId?: string,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const warehouseId = query.warehouseId?.trim();
    const search = query.search?.trim();
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';
    if (warehouseId) {
      await this.assertTenantWarehouseExists(tenantId, warehouseId);
    }
    const where: Prisma.InventoryMovementWhereInput = {
      tenantId,
      ...(inventoryItemId ? { inventoryItemId } : {}),
      ...(warehouseId ? { warehouseId } : {}),
      ...(query.type ? { type: query.type } : {}),
      AND: [
        { InventoryItem: { is: { tenantId } } },
        {
          OR: [{ warehouseId: null }, { Warehouse: { is: { tenantId } } }],
        },
      ],
      ...(search
        ? {
            OR: [
              { note: { contains: search, mode: 'insensitive' } },
              {
                InventoryItem: {
                  is: { name: { contains: search, mode: 'insensitive' } },
                },
              },
              {
                InventoryItem: {
                  is: { code: { contains: search, mode: 'insensitive' } },
                },
              },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.inventoryMovement.findMany({
        where,
        select: {
          id: true,
          tenantId: true,
          type: true,
          quantity: true,
          note: true,
          createdAt: true,
          afterQuantity: true,
          beforeQuantity: true,
          createdById: true,
          inventoryItemId: true,
          referenceId: true,
          referenceType: true,
          warehouseId: true,
          InventoryItem: {
            select: { id: true, name: true, code: true, type: true },
          },
          Warehouse: {
            select: { id: true, name: true, code: true },
          },
          User: {
            select: { id: true, email: true },
          },
        },
        orderBy: [{ [sortBy]: sortOrder }, { id: sortOrder }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findInventoryItem(tenantId: string, inventoryItemId: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: inventoryItemId, tenantId },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        unit: true,
        type: true,
        isActive: true,
        tenantId: true,
        createdAt: true,
      },
    });
    if (!item) {
      throw new NotFoundException('Inventory item not found');
    }
    return item;
  }

  async stockBalances(tenantId: string, inventoryItemId: string) {
    const item = await this.findInventoryItem(tenantId, inventoryItemId);
    const stockRows = await this.prisma.inventoryStock.findMany({
      where: {
        inventoryItemId,
        OR: [{ warehouseId: null }, { Warehouse: { is: { tenantId } } }],
      },
      select: {
        warehouseId: true,
        quantity: true,
        updatedAt: true,
        Warehouse: {
          select: { id: true, name: true, code: true, outletId: true },
        },
      },
      orderBy: [{ warehouseId: 'asc' }, { updatedAt: 'desc' }],
    });

    const balanceByWarehouse = new Map<
      string | null,
      {
        warehouseId: string | null;
        warehouse: {
          id: string;
          name: string;
          code: string;
          outletId: string | null;
        } | null;
        quantity: number;
        updatedAt: Date;
      }
    >();
    for (const stock of stockRows) {
      const key = stock.warehouseId;
      const current = balanceByWarehouse.get(key);
      if (current) {
        current.quantity += stock.quantity;
        if (stock.updatedAt > current.updatedAt) {
          current.updatedAt = stock.updatedAt;
        }
      } else {
        balanceByWarehouse.set(key, {
          warehouseId: stock.warehouseId,
          warehouse: stock.Warehouse,
          quantity: stock.quantity,
          updatedAt: stock.updatedAt,
        });
      }
    }

    const balances = [...balanceByWarehouse.values()];
    return {
      item: {
        id: item.id,
        code: item.code,
        name: item.name,
        type: item.type,
        unit: item.unit,
      },
      balances,
      totalQuantity: balances.reduce((total, balance) => {
        return total + balance.quantity;
      }, 0),
    };
  }

  async availability(tenantId: string, inventoryItemId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const item = await tx.inventoryItem.findFirst({
          where: { id: inventoryItemId, tenantId },
          select: { id: true, code: true, name: true, type: true, unit: true },
        });
        if (!item) {
          throw new NotFoundException('Inventory item not found');
        }

        const [stockRows, reservations, reorderRules] = await Promise.all([
          tx.inventoryStock.findMany({
            where: {
              inventoryItemId,
              OR: [{ warehouseId: null }, { Warehouse: { is: { tenantId } } }],
            },
            select: {
              warehouseId: true,
              quantity: true,
              Warehouse: {
                select: { id: true, name: true, code: true, outletId: true },
              },
            },
          }),
          tx.inventoryMovement.findMany({
            where: {
              tenantId,
              inventoryItemId,
              referenceType: ACTIVE_RESERVATION_REF,
              OR: [{ warehouseId: null }, { Warehouse: { is: { tenantId } } }],
            },
            select: {
              warehouseId: true,
              quantity: true,
              Warehouse: {
                select: { id: true, name: true, code: true, outletId: true },
              },
            },
          }),
          tx.inventoryReorderRule.findMany({
            where: { tenantId, inventoryItemId },
            include: {
              Warehouse: {
                select: { id: true, name: true, code: true, outletId: true },
              },
            },
            orderBy: [{ scope: 'asc' }, { locationKey: 'asc' }],
          }),
        ]);

        const balances = new Map<
          string | null,
          {
            warehouseId: string | null;
            warehouse: (typeof stockRows)[number]['Warehouse'];
            availableQuantity: number;
            reservedQuantity: number;
          }
        >();
        for (const stock of stockRows) {
          balances.set(stock.warehouseId, {
            warehouseId: stock.warehouseId,
            warehouse: stock.Warehouse,
            availableQuantity: stock.quantity,
            reservedQuantity: 0,
          });
        }
        for (const reservation of reservations) {
          const balance = balances.get(reservation.warehouseId) ?? {
            warehouseId: reservation.warehouseId,
            warehouse: reservation.Warehouse,
            availableQuantity: 0,
            reservedQuantity: 0,
          };
          balance.reservedQuantity += reservation.quantity;
          balances.set(reservation.warehouseId, balance);
        }
        for (const rule of reorderRules) {
          if (
            rule.scope === InventoryReorderScope.PER_WAREHOUSE &&
            rule.warehouseId &&
            !balances.has(rule.warehouseId)
          ) {
            balances.set(rule.warehouseId, {
              warehouseId: rule.warehouseId,
              warehouse: rule.Warehouse,
              availableQuantity: 0,
              reservedQuantity: 0,
            });
          }
        }

        const locations = [...balances.values()].map((balance) => {
          const rule = reorderRules.find(
            (candidate) =>
              candidate.scope === InventoryReorderScope.PER_WAREHOUSE &&
              candidate.warehouseId === balance.warehouseId,
          );
          return {
            ...balance,
            onHandQuantity:
              balance.availableQuantity + balance.reservedQuantity,
            replenishment: rule
              ? this.buildReorderRecommendation(rule, balance.availableQuantity)
              : null,
          };
        });
        const totals = locations.reduce(
          (total, location) => ({
            availableQuantity:
              total.availableQuantity + location.availableQuantity,
            reservedQuantity:
              total.reservedQuantity + location.reservedQuantity,
            onHandQuantity: total.onHandQuantity + location.onHandQuantity,
          }),
          { availableQuantity: 0, reservedQuantity: 0, onHandQuantity: 0 },
        );
        const tenantTotalRule = reorderRules.find(
          (rule) => rule.scope === InventoryReorderScope.TENANT_ITEM_TOTAL,
        );

        return {
          item,
          balances: locations,
          totals,
          tenantTotalReplenishment: tenantTotalRule
            ? this.buildReorderRecommendation(
                tenantTotalRule,
                totals.availableQuantity,
              )
            : null,
          reorderRules: reorderRules.map((rule) => ({
            id: rule.id,
            scope: rule.scope,
            warehouseId: rule.warehouseId,
            warehouse: rule.Warehouse,
            reorderPoint: rule.reorderPoint,
            quantityStrategy: rule.quantityStrategy,
            targetStock: rule.targetStock,
            fixedOrderQuantity: rule.fixedOrderQuantity,
            action: rule.action,
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async getReorderRules(tenantId: string, inventoryItemId: string) {
    await this.findInventoryItem(tenantId, inventoryItemId);
    return this.prisma.inventoryReorderRule.findMany({
      where: { tenantId, inventoryItemId },
      include: {
        Warehouse: {
          select: { id: true, name: true, code: true, outletId: true },
        },
      },
      orderBy: [{ scope: 'asc' }, { locationKey: 'asc' }],
    });
  }

  async replaceReorderRules(
    tenantId: string,
    inventoryItemId: string,
    dto: InventoryReorderRulesDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const [item] = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "InventoryItem"
        WHERE "id" = ${inventoryItemId} AND "tenantId" = ${tenantId}
        FOR UPDATE
      `;
      if (!item) {
        throw new NotFoundException('Inventory item not found');
      }

      if (
        dto.scope === InventoryReorderScope.TENANT_ITEM_TOTAL &&
        dto.rules.length > 1
      ) {
        throw new BadRequestException(
          'Tenant-total scope supports one reorder rule per item',
        );
      }
      if (
        dto.scope === InventoryReorderScope.PER_WAREHOUSE &&
        dto.rules.some((rule) => !rule.warehouseId)
      ) {
        throw new BadRequestException(
          'Each per-warehouse reorder rule requires a warehouse',
        );
      }
      if (
        dto.scope === InventoryReorderScope.TENANT_ITEM_TOTAL &&
        dto.rules.some((rule) => rule.warehouseId)
      ) {
        throw new BadRequestException(
          'Tenant-total reorder rules cannot reference a warehouse',
        );
      }

      const locationKeys = dto.rules.map((rule) =>
        dto.scope === InventoryReorderScope.TENANT_ITEM_TOTAL
          ? 'ALL'
          : rule.warehouseId!,
      );
      if (new Set(locationKeys).size !== locationKeys.length) {
        throw new BadRequestException(
          'Each inventory location can have only one reorder rule',
        );
      }

      for (const rule of dto.rules) {
        if (
          rule.quantityStrategy ===
          InventoryReorderQuantityStrategy.TARGET_STOCK
        ) {
          if (
            rule.targetStock === undefined ||
            rule.targetStock <= rule.reorderPoint ||
            rule.fixedOrderQuantity !== undefined
          ) {
            throw new BadRequestException(
              'Target stock must exceed the reorder point and fixed quantity must be omitted',
            );
          }
        } else if (
          rule.fixedOrderQuantity === undefined ||
          rule.fixedOrderQuantity <= 0 ||
          rule.targetStock !== undefined
        ) {
          throw new BadRequestException(
            'A positive fixed order quantity is required and target stock must be omitted',
          );
        }
      }

      const warehouseIds = dto.rules
        .map((rule) => rule.warehouseId)
        .filter((warehouseId): warehouseId is string => Boolean(warehouseId));
      if (warehouseIds.length) {
        const warehouses = await tx.warehouse.findMany({
          where: { tenantId, id: { in: warehouseIds } },
          select: { id: true },
        });
        if (warehouses.length !== new Set(warehouseIds).size) {
          throw new BadRequestException(
            'Reorder rules can reference only warehouses in this tenant',
          );
        }
      }

      await tx.inventoryReorderRule.deleteMany({
        where: { tenantId, inventoryItemId },
      });
      for (const rule of dto.rules) {
        await tx.inventoryReorderRule.create({
          data: {
            tenantId,
            inventoryItemId,
            warehouseId: rule.warehouseId ?? null,
            locationKey: rule.warehouseId ?? 'ALL',
            scope: dto.scope,
            quantityStrategy: rule.quantityStrategy,
            action: rule.action ?? InventoryReorderAction.ALERT_AND_SUGGEST,
            reorderPoint: rule.reorderPoint,
            targetStock: rule.targetStock,
            fixedOrderQuantity: rule.fixedOrderQuantity,
          },
        });
      }

      return tx.inventoryReorderRule.findMany({
        where: { tenantId, inventoryItemId },
        include: {
          Warehouse: {
            select: { id: true, name: true, code: true, outletId: true },
          },
        },
        orderBy: [{ scope: 'asc' }, { locationKey: 'asc' }],
      });
    });
  }

  private buildReorderRecommendation(
    rule: {
      scope: InventoryReorderScope;
      warehouseId: string | null;
      reorderPoint: number;
      quantityStrategy: InventoryReorderQuantityStrategy;
      targetStock: number | null;
      fixedOrderQuantity: number | null;
      action: InventoryReorderAction;
    },
    availableQuantity: number,
  ) {
    const reorderRequired = availableQuantity <= rule.reorderPoint;
    return {
      scope: rule.scope,
      warehouseId: rule.warehouseId,
      action: rule.action,
      status: reorderRequired ? 'REORDER_REQUIRED' : 'SUFFICIENT',
      reorderPoint: rule.reorderPoint,
      availableQuantity,
      recommendedQuantity:
        reorderRequired &&
        rule.action === InventoryReorderAction.ALERT_AND_SUGGEST
          ? rule.quantityStrategy ===
            InventoryReorderQuantityStrategy.TARGET_STOCK
            ? Math.max(0, (rule.targetStock ?? 0) - availableQuantity)
            : (rule.fixedOrderQuantity ?? 0)
          : null,
    };
  }

  async listInventoryItems(tenantId: string, query: InventoryItemListQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();
    const warehouseId = query.warehouseId?.trim();
    if (warehouseId) {
      await this.assertTenantWarehouseExists(tenantId, warehouseId);
    }

    const where: Prisma.InventoryItemWhereInput = {
      tenantId,
      ...(query.type ? { type: query.type } : {}),
      ...(warehouseId ? { InventoryStock: { some: { warehouseId } } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { code: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const sortBy: Prisma.InventoryItemOrderByWithRelationInput =
      query.sortBy === 'name'
        ? { name: query.sortOrder ?? 'asc' }
        : query.sortBy === 'code'
          ? { code: query.sortOrder ?? 'asc' }
          : { createdAt: query.sortOrder ?? 'desc' };
    const [data, total] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where,
        orderBy: [sortBy, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async assertTenantWarehouseExists(
    tenantId: string,
    warehouseId: string,
  ) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, tenantId },
      select: { id: true },
    });
    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }
  }
}
