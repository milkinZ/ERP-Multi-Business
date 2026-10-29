import { BadRequestException, Injectable } from '@nestjs/common';
import {
  InventoryMovementType,
  InventoryValuationMethod,
  MovingAverageScope,
  Prisma,
} from '@prisma/client';

const ACTIVE_RESERVATION_REF = 'ORDER_RESERVATION';

type CostAllocation = {
  costLayerId: string | null;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
};

type HistoricalCostPart = {
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  sourceMovementId?: string | null;
  sourceType?: string;
};

type HistoricalMovementRecord = {
  id: string;
  type: InventoryMovementType;
  quantity: number;
  beforeQuantity: number | null;
  afterQuantity: number | null;
  createdAt: Date;
  referenceId: string | null;
  referenceType: string | null;
  warehouseId: string | null;
  inventoryItemId: string;
  unitCost: Prisma.Decimal | null;
  CostAllocations: Array<
    HistoricalCostPart & {
      CostLayer: {
        sourceMovementId: string | null;
        sourceType: string;
      } | null;
    }
  >;
};

type HistoricalMovementCost = {
  parts: HistoricalCostPart[];
  unitCost: Prisma.Decimal | null;
};

export type InventoryIssueCost = {
  unitCost: Prisma.Decimal;
  totalCost: Prisma.Decimal;
  allocations: CostAllocation[];
};

export type HistoricalFifoLayer = {
  warehouseId: string | null;
  receivedQuantity: Prisma.Decimal;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal | null;
  sourceMovementId: string | null;
  sourceReferenceId: string | null;
  sourceType: string;
  createdAt: Date;
};

export type HistoricalFifoBalance = {
  warehouseId: string | null;
  currentQuantity: number;
  layers: HistoricalFifoLayer[];
  openingCostQuantity: Prisma.Decimal;
  reconciled: boolean;
};

export type HistoricalMovingAverageBalance = {
  warehouseId: string | null;
  currentQuantity: number;
  warehouseAverageUnitCost: Prisma.Decimal | null;
  warehouseReconciled: boolean;
  itemOpeningCostQuantity: Prisma.Decimal;
  warehouseOpeningCostQuantity: Prisma.Decimal;
};

export type HistoricalMovingAverage = {
  itemAverageUnitCost: Prisma.Decimal | null;
  itemReconciled: boolean;
  balances: HistoricalMovingAverageBalance[];
};

@Injectable()
export class InventoryCostingService {
  async reconstructHistoricalFifo(
    tx: Prisma.TransactionClient,
    tenantId: string,
    inventoryItemId: string,
    stocks: Array<{ warehouseId: string | null; quantity: number }>,
  ): Promise<HistoricalFifoBalance[]> {
    const [movements, receiptItems] = await Promise.all([
      tx.inventoryMovement.findMany({
        where: { tenantId, inventoryItemId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          type: true,
          quantity: true,
          beforeQuantity: true,
          afterQuantity: true,
          createdAt: true,
          referenceId: true,
          referenceType: true,
          warehouseId: true,
          inventoryItemId: true,
          unitCost: true,
          CostAllocations: {
            orderBy: { id: 'asc' },
            select: {
              quantity: true,
              unitCost: true,
              CostLayer: {
                select: { sourceMovementId: true, sourceType: true },
              },
            },
          },
        },
      }),
      tx.purchaseOrderReceiptItem.findMany({
        where: { tenantId, inventoryItemId },
        select: {
          receiptId: true,
          PurchaseOrderItem: {
            select: {
              unitPrice: true,
              PurchaseOrder: { select: { warehouseId: true } },
            },
          },
        },
      }),
    ]);
    const purchaseReceiptCosts = new Map(
      receiptItems.map((receiptItem) => [
        receiptItem.receiptId,
        {
          warehouseId: receiptItem.PurchaseOrderItem.PurchaseOrder.warehouseId,
          unitCost: new Prisma.Decimal(receiptItem.PurchaseOrderItem.unitPrice),
        },
      ]),
    );
    const historicalMovements = movements.filter(
      (movement) => movement.referenceType !== ACTIVE_RESERVATION_REF,
    );
    const historicalCostParts = await this.historicalMovementCosts(
      tx,
      tenantId,
      historicalMovements,
    );
    const stockByWarehouse = new Map(
      stocks.map((stock) => [stock.warehouseId ?? '', stock.quantity]),
    );
    const movementsByWarehouse = new Map<string, typeof movements>();
    for (const movement of historicalMovements) {
      const key = movement.warehouseId ?? '';
      const warehouseMovements = movementsByWarehouse.get(key) ?? [];
      warehouseMovements.push(movement);
      movementsByWarehouse.set(key, warehouseMovements);
    }

    const keys = new Set([
      ...stockByWarehouse.keys(),
      ...movementsByWarehouse.keys(),
    ]);
    return [...keys].map((key) => {
      const warehouseId = key || null;
      const currentQuantity = stockByWarehouse.get(key) ?? 0;
      const warehouseMovements = movementsByWarehouse.get(key) ?? [];
      const layers: HistoricalFifoLayer[] = [];
      let ledgerQuantity = 0;
      let reconciled = true;

      if (warehouseMovements.length > 0) {
        const firstMovement = warehouseMovements[0];
        if (firstMovement.beforeQuantity === null) {
          reconciled = false;
        } else {
          ledgerQuantity = firstMovement.beforeQuantity;
          if (ledgerQuantity > 0) {
            layers.push({
              warehouseId,
              receivedQuantity: new Prisma.Decimal(ledgerQuantity),
              quantity: new Prisma.Decimal(ledgerQuantity),
              unitCost: null,
              sourceMovementId: null,
              sourceReferenceId: inventoryItemId,
              sourceType: 'LEGACY_OPENING_BALANCE',
              createdAt: new Date(firstMovement.createdAt.getTime() - 1),
            });
          }
        }

        for (const movement of warehouseMovements) {
          if (!reconciled) break;
          if (
            movement.beforeQuantity !== null &&
            Math.abs(ledgerQuantity - movement.beforeQuantity) > 1e-6
          ) {
            reconciled = false;
            break;
          }
          const delta = this.movementQuantityDelta(movement);
          if (delta === null) {
            reconciled = false;
            break;
          }
          if (
            movement.afterQuantity !== null &&
            Math.abs(ledgerQuantity + delta - movement.afterQuantity) > 1e-6
          ) {
            reconciled = false;
            break;
          }
          if (delta > 0) {
            const receiptCost =
              movement.referenceType === 'PURCHASE_ORDER_RECEIPT' &&
              movement.referenceId
                ? purchaseReceiptCosts.get(movement.referenceId)
                : undefined;
            const historicalCost = historicalCostParts.get(movement.id);
            const costParts =
              historicalCost?.parts ??
              (movement.referenceType !== 'WAREHOUSE_TRANSFER_RECEIPT' &&
              movement.referenceType !== 'ORDER_RESERVATION_RELEASE' &&
              movement.unitCost !== null
                ? [
                    {
                      quantity: new Prisma.Decimal(delta),
                      unitCost: movement.unitCost,
                    },
                  ]
                : receiptCost?.warehouseId === warehouseId
                  ? [
                      {
                        quantity: new Prisma.Decimal(delta),
                        unitCost: receiptCost.unitCost,
                      },
                    ]
                  : []);
            if (movement.referenceType === 'ORDER_RESERVATION_RELEASE') {
              let restoredQuantity = new Prisma.Decimal(0);
              for (const part of costParts) {
                if (!part.sourceMovementId) continue;
                const sourceLayer = layers.find((layer) =>
                  part.sourceMovementId
                    ? layer.sourceMovementId === part.sourceMovementId &&
                      layer.unitCost?.eq(part.unitCost)
                    : [
                        'OPENING_BALANCE',
                        'LEGACY_OPENING_COST',
                        'LEGACY_OPENING_BALANCE',
                      ].includes(part.sourceType ?? '') &&
                      layer.sourceMovementId === null &&
                      layer.sourceType === 'LEGACY_OPENING_BALANCE',
                );
                if (!sourceLayer) continue;
                const restored = Prisma.Decimal.min(
                  part.quantity,
                  new Prisma.Decimal(delta).sub(restoredQuantity),
                );
                if (restored.lte(0)) break;
                sourceLayer.quantity = sourceLayer.quantity.add(restored);
                restoredQuantity = restoredQuantity.add(restored);
              }
              const untraceableQuantity = new Prisma.Decimal(delta).sub(
                restoredQuantity,
              );
              if (untraceableQuantity.gt(0)) {
                layers.push({
                  warehouseId,
                  receivedQuantity: untraceableQuantity,
                  quantity: untraceableQuantity,
                  unitCost: null,
                  sourceMovementId: movement.id,
                  sourceReferenceId: movement.referenceId,
                  sourceType: 'LEGACY_RESERVATION_RELEASE',
                  createdAt: movement.createdAt,
                });
              }
              ledgerQuantity = movement.afterQuantity ?? ledgerQuantity + delta;
              continue;
            }
            let coveredQuantity = new Prisma.Decimal(0);
            for (const part of costParts) {
              const quantity = Prisma.Decimal.min(
                part.quantity,
                new Prisma.Decimal(delta).sub(coveredQuantity),
              );
              if (quantity.lte(0)) break;
              layers.push({
                warehouseId,
                receivedQuantity: quantity,
                quantity,
                unitCost: part.unitCost,
                sourceMovementId: movement.id,
                sourceReferenceId: movement.referenceId,
                sourceType: movement.referenceType ?? `LEGACY_${movement.type}`,
                createdAt: movement.createdAt,
              });
              coveredQuantity = coveredQuantity.add(quantity);
            }
            const unknownQuantity = new Prisma.Decimal(delta).sub(
              coveredQuantity,
            );
            if (unknownQuantity.gt(0)) {
              layers.push({
                warehouseId,
                receivedQuantity: unknownQuantity,
                quantity: unknownQuantity,
                unitCost: null,
                sourceMovementId: movement.id,
                sourceReferenceId: movement.referenceId,
                sourceType: movement.referenceType ?? `LEGACY_${movement.type}`,
                createdAt: movement.createdAt,
              });
            }
          } else if (delta < 0) {
            let toConsume = new Prisma.Decimal(Math.abs(delta));
            for (const layer of layers) {
              if (toConsume.lte(0)) break;
              const consumed = Prisma.Decimal.min(layer.quantity, toConsume);
              layer.quantity = layer.quantity.sub(consumed);
              toConsume = toConsume.sub(consumed);
            }
            if (toConsume.gt(0)) {
              reconciled = false;
              break;
            }
          }
          ledgerQuantity = movement.afterQuantity ?? ledgerQuantity + delta;
        }
        if (
          Math.abs(ledgerQuantity - currentQuantity) > 1e-6 ||
          ledgerQuantity < 0
        ) {
          reconciled = false;
        }
      } else if (currentQuantity > 0) {
        layers.push({
          warehouseId,
          receivedQuantity: new Prisma.Decimal(currentQuantity),
          quantity: new Prisma.Decimal(currentQuantity),
          unitCost: null,
          sourceMovementId: null,
          sourceReferenceId: inventoryItemId,
          sourceType: 'LEGACY_OPENING_BALANCE',
          createdAt: new Date(),
        });
      }

      const remainingLayers = reconciled
        ? layers.filter((layer) => layer.quantity.gt(0))
        : currentQuantity > 0
          ? [
              {
                warehouseId,
                receivedQuantity: new Prisma.Decimal(currentQuantity),
                quantity: new Prisma.Decimal(currentQuantity),
                unitCost: null,
                sourceMovementId: null,
                sourceReferenceId: inventoryItemId,
                sourceType: 'LEGACY_OPENING_BALANCE',
                createdAt: new Date(),
              },
            ]
          : [];
      const openingCostQuantity = remainingLayers
        .filter((layer) => layer.unitCost === null)
        .reduce(
          (total, layer) => total.add(layer.quantity),
          new Prisma.Decimal(0),
        );

      return {
        warehouseId,
        currentQuantity,
        layers: remainingLayers,
        openingCostQuantity,
        reconciled,
      };
    });
  }

  async reconstructHistoricalMovingAverage(
    tx: Prisma.TransactionClient,
    tenantId: string,
    inventoryItemId: string,
    stocks: Array<{ warehouseId: string | null; quantity: number }>,
  ): Promise<HistoricalMovingAverage> {
    const [movements, receiptItems] = await Promise.all([
      tx.inventoryMovement.findMany({
        where: { tenantId, inventoryItemId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          type: true,
          quantity: true,
          beforeQuantity: true,
          afterQuantity: true,
          createdAt: true,
          referenceId: true,
          referenceType: true,
          warehouseId: true,
          inventoryItemId: true,
          unitCost: true,
          CostAllocations: {
            orderBy: { id: 'asc' },
            select: {
              quantity: true,
              unitCost: true,
              CostLayer: {
                select: { sourceMovementId: true, sourceType: true },
              },
            },
          },
        },
      }),
      tx.purchaseOrderReceiptItem.findMany({
        where: { tenantId, inventoryItemId },
        select: {
          receiptId: true,
          PurchaseOrderItem: {
            select: {
              unitPrice: true,
              PurchaseOrder: { select: { warehouseId: true } },
            },
          },
        },
      }),
    ]);
    const purchaseReceiptCosts = new Map(
      receiptItems.map((receiptItem) => [
        receiptItem.receiptId,
        {
          warehouseId: receiptItem.PurchaseOrderItem.PurchaseOrder.warehouseId,
          unitCost: new Prisma.Decimal(receiptItem.PurchaseOrderItem.unitPrice),
        },
      ]),
    );
    const historicalMovements = movements.filter(
      (movement) => movement.referenceType !== ACTIVE_RESERVATION_REF,
    );
    const historicalCostParts = await this.historicalMovementCosts(
      tx,
      tenantId,
      historicalMovements,
    );
    const stockByWarehouse = new Map(
      stocks.map((stock) => [stock.warehouseId ?? '', stock.quantity]),
    );
    const movementsByWarehouse = new Map<string, typeof movements>();
    for (const movement of historicalMovements) {
      const key = movement.warehouseId ?? '';
      const warehouseMovements = movementsByWarehouse.get(key) ?? [];
      warehouseMovements.push(movement);
      movementsByWarehouse.set(key, warehouseMovements);
    }

    const warehouseStates = new Map<
      string,
      { quantity: Prisma.Decimal; averageUnitCost: Prisma.Decimal | null }
    >();
    const itemStates = {
      quantity: new Prisma.Decimal(0),
      averageUnitCost: null as Prisma.Decimal | null,
    };
    let itemReconciled = true;
    const locationKeys = new Set([
      ...stockByWarehouse.keys(),
      ...movementsByWarehouse.keys(),
    ]);
    for (const key of locationKeys) {
      const warehouseMovements = movementsByWarehouse.get(key) ?? [];
      const initialQuantity =
        warehouseMovements.length > 0
          ? warehouseMovements[0].beforeQuantity
          : (stockByWarehouse.get(key) ?? 0);
      if (initialQuantity === null || initialQuantity === undefined) {
        itemReconciled = false;
        warehouseStates.set(key, {
          quantity: new Prisma.Decimal(stockByWarehouse.get(key) ?? 0),
          averageUnitCost: null,
        });
        continue;
      }
      const quantity = new Prisma.Decimal(initialQuantity);
      warehouseStates.set(key, {
        quantity,
        averageUnitCost: null,
      });
      itemStates.quantity = itemStates.quantity.add(quantity);
    }

    const warehouseReconciled = new Map(
      [...locationKeys].map((key) => [key, true]),
    );
    for (const movement of movements) {
      const key = movement.warehouseId ?? '';
      const state = warehouseStates.get(key);
      if (!state) {
        itemReconciled = false;
        warehouseReconciled.set(key, false);
        continue;
      }
      const delta = this.movementQuantityDelta(movement);
      if (
        delta === null ||
        (movement.beforeQuantity !== null &&
          Math.abs(state.quantity.toNumber() - movement.beforeQuantity) >
            1e-6) ||
        (movement.afterQuantity !== null &&
          Math.abs(state.quantity.toNumber() + delta - movement.afterQuantity) >
            1e-6)
      ) {
        itemReconciled = false;
        warehouseReconciled.set(key, false);
        continue;
      }

      if (delta > 0) {
        const receiptCost =
          movement.referenceType === 'PURCHASE_ORDER_RECEIPT' &&
          movement.referenceId
            ? purchaseReceiptCosts.get(movement.referenceId)
            : undefined;
        const replayUnitCost =
          historicalCostParts.get(movement.id)?.unitCost ??
          movement.unitCost ??
          (receiptCost?.warehouseId === movement.warehouseId
            ? receiptCost.unitCost
            : null);
        if (replayUnitCost === null) {
          state.averageUnitCost = null;
          itemStates.averageUnitCost = null;
        } else {
          const cost = new Prisma.Decimal(replayUnitCost);
          if (state.quantity.eq(0)) {
            state.averageUnitCost = cost;
          } else if (state.averageUnitCost !== null) {
            state.averageUnitCost = state.quantity
              .mul(state.averageUnitCost)
              .add(new Prisma.Decimal(delta).mul(cost))
              .div(state.quantity.add(delta));
          }
          if (itemStates.quantity.eq(0)) {
            itemStates.averageUnitCost = cost;
          } else if (itemStates.averageUnitCost !== null) {
            itemStates.averageUnitCost = itemStates.quantity
              .mul(itemStates.averageUnitCost)
              .add(new Prisma.Decimal(delta).mul(cost))
              .div(itemStates.quantity.add(delta));
          }
        }
      }

      const nextWarehouseQuantity = state.quantity.add(delta);
      const nextItemQuantity = itemStates.quantity.add(delta);
      if (nextWarehouseQuantity.lt(0) || nextItemQuantity.lt(0)) {
        itemReconciled = false;
        warehouseReconciled.set(key, false);
        continue;
      }
      state.quantity = nextWarehouseQuantity;
      itemStates.quantity = nextItemQuantity;
      if (state.quantity.eq(0)) state.averageUnitCost = null;
      if (itemStates.quantity.eq(0)) itemStates.averageUnitCost = null;
    }

    const balances = [...locationKeys].map((key) => {
      const currentQuantity = stockByWarehouse.get(key) ?? 0;
      const state = warehouseStates.get(key)!;
      const ledgerMatches =
        Math.abs(state.quantity.toNumber() - currentQuantity) <= 1e-6;
      const hasMovementGap =
        (currentQuantity > 0 && !warehouseReconciled.get(key)) ||
        !ledgerMatches;
      const hasUnknownWarehouseCost =
        currentQuantity > 0 && state.averageUnitCost === null;
      const warehouseCanReplay = !hasMovementGap && !hasUnknownWarehouseCost;
      if (!ledgerMatches) {
        itemReconciled = false;
        warehouseReconciled.set(key, false);
      }
      if (hasUnknownWarehouseCost) warehouseReconciled.set(key, false);
      return {
        warehouseId: key || null,
        currentQuantity,
        warehouseAverageUnitCost: warehouseCanReplay
          ? state.averageUnitCost
          : null,
        warehouseReconciled: warehouseCanReplay,
        warehouseOpeningCostQuantity: warehouseCanReplay
          ? new Prisma.Decimal(0)
          : new Prisma.Decimal(Math.max(currentQuantity, 0)),
        itemOpeningCostQuantity: new Prisma.Decimal(0),
      };
    });

    const totalCurrentQuantity = stocks.reduce(
      (total, stock) => total + stock.quantity,
      0,
    );
    const itemLedgerMatches =
      Math.abs(itemStates.quantity.toNumber() - totalCurrentQuantity) <= 1e-6;
    const itemCanReplay =
      itemReconciled &&
      itemLedgerMatches &&
      (totalCurrentQuantity <= 0 || itemStates.averageUnitCost !== null);
    if (!itemLedgerMatches) itemReconciled = false;
    if (!itemCanReplay) {
      for (const balance of balances) {
        balance.itemOpeningCostQuantity = new Prisma.Decimal(
          Math.max(balance.currentQuantity, 0),
        );
      }
    }

    return {
      itemAverageUnitCost: itemCanReplay ? itemStates.averageUnitCost : null,
      itemReconciled: itemCanReplay,
      balances,
    };
  }

  private async historicalMovementCosts(
    tx: Prisma.TransactionClient,
    tenantId: string,
    movements: HistoricalMovementRecord[],
  ): Promise<Map<string, HistoricalMovementCost>> {
    const movementCosts = new Map<string, HistoricalMovementCost>();
    const sourceMovementByTransferItem = new Map<
      string,
      HistoricalMovementRecord
    >();
    const receiptMovementByReceiptItem = new Map<
      string,
      HistoricalMovementRecord
    >();
    const reservationSources = new Map<
      string,
      HistoricalMovementRecord | null
    >();
    const sourceKey = (...parts: Array<string | null>) => JSON.stringify(parts);
    for (const movement of movements) {
      if (
        movement.referenceType === 'WAREHOUSE_TRANSFER_SHIPMENT' &&
        movement.referenceId
      ) {
        sourceMovementByTransferItem.set(
          sourceKey(
            movement.referenceId,
            movement.inventoryItemId,
            movement.warehouseId,
          ),
          movement,
        );
      }
      if (
        movement.referenceType === 'WAREHOUSE_TRANSFER_RECEIPT' &&
        movement.referenceId
      ) {
        receiptMovementByReceiptItem.set(
          sourceKey(
            movement.referenceId,
            movement.inventoryItemId,
            movement.warehouseId,
          ),
          movement,
        );
      }
      if (
        movement.referenceId &&
        [
          'ORDER_RESERVATION_RELEASED',
          'ORDER_RESERVATION_CANCELLED',
          'ORDER_RESERVATION_EXPIRED',
        ].includes(movement.referenceType ?? '')
      ) {
        const key = sourceKey(
          movement.referenceId,
          movement.inventoryItemId,
          movement.warehouseId,
        );
        reservationSources.set(
          key,
          reservationSources.has(key) ? null : movement,
        );
      }
    }
    const transferReceipts = movements.filter(
      (movement) =>
        movement.referenceType === 'WAREHOUSE_TRANSFER_RECEIPT' &&
        movement.referenceId,
    );
    const receiptIds = [
      ...new Set(
        transferReceipts
          .map((movement) => movement.referenceId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const receipts =
      receiptIds.length > 0
        ? await tx.warehouseTransferReceipt.findMany({
            where: { tenantId, id: { in: receiptIds } },
            select: {
              id: true,
              transferId: true,
              createdAt: true,
              Transfer: {
                select: {
                  sourceWarehouseId: true,
                  destinationWarehouseId: true,
                },
              },
              Items: {
                select: { inventoryItemId: true, receivedQuantity: true },
              },
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          })
        : [];

    const normalizedParts = (parts: HistoricalCostPart[], quantity: number) => {
      const target = new Prisma.Decimal(quantity);
      let remaining = target;
      const normalized: HistoricalCostPart[] = [];
      for (const part of parts) {
        if (remaining.lte(0)) break;
        const partQuantity = Prisma.Decimal.min(
          new Prisma.Decimal(part.quantity),
          remaining,
        );
        if (partQuantity.lte(0)) continue;
        normalized.push({
          quantity: partQuantity,
          unitCost: new Prisma.Decimal(part.unitCost),
          sourceMovementId: part.sourceMovementId,
          sourceType: part.sourceType,
        });
        remaining = remaining.sub(partQuantity);
      }
      const covered = target.sub(remaining);
      const unitCost =
        remaining.eq(0) && covered.gt(0)
          ? normalized
              .reduce(
                (total, part) => total.add(part.quantity.mul(part.unitCost)),
                new Prisma.Decimal(0),
              )
              .div(target)
          : null;
      return { parts: normalized, unitCost };
    };

    for (const movement of movements) {
      if (movement.CostAllocations.length > 0) {
        const normalized = normalizedParts(
          movement.CostAllocations.map((allocation) => ({
            quantity: allocation.quantity,
            unitCost: allocation.unitCost,
            sourceMovementId: allocation.CostLayer?.sourceMovementId ?? null,
            sourceType: allocation.CostLayer?.sourceType,
          })),
          Math.abs(this.movementQuantityDelta(movement) ?? movement.quantity),
        );
        movementCosts.set(movement.id, normalized);
      }
    }

    const receivedByTransferItem = new Map<string, Prisma.Decimal>();
    for (const receipt of receipts) {
      for (const receiptItem of receipt.Items) {
        const transferItemKey = sourceKey(
          receipt.transferId,
          receiptItem.inventoryItemId,
        );
        const sourceMovement = sourceMovementByTransferItem.get(
          sourceKey(
            receipt.transferId,
            receiptItem.inventoryItemId,
            receipt.Transfer.sourceWarehouseId,
          ),
        );
        const receiptMovement = receiptMovementByReceiptItem.get(
          sourceKey(
            receipt.id,
            receiptItem.inventoryItemId,
            receipt.Transfer.destinationWarehouseId,
          ),
        );
        if (!sourceMovement || !receiptMovement) continue;

        const sourceCost = movementCosts.get(sourceMovement.id);
        const skip =
          receivedByTransferItem.get(transferItemKey) ?? new Prisma.Decimal(0);
        const quantity = new Prisma.Decimal(receiptItem.receivedQuantity);
        const availableParts = sourceCost?.parts ?? [];
        let offset = skip;
        let remaining = quantity;
        const receiptParts: HistoricalCostPart[] = [];
        for (const part of availableParts) {
          if (remaining.lte(0)) break;
          if (offset.gte(part.quantity)) {
            offset = offset.sub(part.quantity);
            continue;
          }
          const available = part.quantity.sub(offset);
          const copied = Prisma.Decimal.min(available, remaining);
          receiptParts.push({ quantity: copied, unitCost: part.unitCost });
          remaining = remaining.sub(copied);
          offset = new Prisma.Decimal(0);
        }
        const normalized = normalizedParts(receiptParts, quantity.toNumber());
        movementCosts.set(receiptMovement.id, {
          parts: normalized.parts,
          unitCost:
            normalized.unitCost ??
            (!sourceCost || sourceCost.parts.length === 0
              ? sourceMovement.unitCost
              : null),
        });
        receivedByTransferItem.set(transferItemKey, skip.add(quantity));
      }
    }

    for (const movement of movements) {
      if (
        movement.referenceType !== 'ORDER_RESERVATION_RELEASE' ||
        movementCosts.get(movement.id)?.unitCost
      ) {
        continue;
      }
      const reservation = reservationSources.get(
        sourceKey(
          movement.referenceId,
          movement.inventoryItemId,
          movement.warehouseId,
        ),
      );
      if (!reservation) continue;
      const sourceCost = movementCosts.get(reservation.id);
      if (sourceCost) {
        const normalized = normalizedParts(
          sourceCost.parts,
          Math.abs(this.movementQuantityDelta(movement) ?? movement.quantity),
        );
        movementCosts.set(movement.id, normalized);
      }
    }

    return movementCosts;
  }

  async lockItem(
    tx: Prisma.TransactionClient,
    tenantId: string,
    itemId: string,
  ) {
    const items = await tx.$queryRaw<
      Array<{
        id: string;
        valuationMethod: InventoryValuationMethod | null;
        movingAverageScope: MovingAverageScope | null;
        standardCost: Prisma.Decimal | null;
        averageUnitCost: Prisma.Decimal | null;
        valuationLockedAt: Date | null;
      }>
    >`
      SELECT "id", "valuationMethod", "movingAverageScope", "standardCost",
             "averageUnitCost", "valuationLockedAt"
      FROM "InventoryItem"
      WHERE "id" = ${itemId} AND "tenantId" = ${tenantId}
      FOR UPDATE
    `;
    const item = items[0];
    if (!item) {
      throw new BadRequestException('Inventory item not found');
    }
    if (!item.valuationMethod) {
      throw new BadRequestException(
        'Configure an inventory valuation method before changing stock',
      );
    }
    if (
      item.valuationMethod ===
        InventoryValuationMethod.MOVING_WEIGHTED_AVERAGE &&
      !item.movingAverageScope
    ) {
      throw new BadRequestException(
        'Configure the moving average cost scope before changing stock',
      );
    }
    if (
      item.valuationMethod === InventoryValuationMethod.STANDARD_COST &&
      !item.standardCost
    ) {
      throw new BadRequestException(
        'Configure a standard cost before changing stock',
      );
    }
    return item;
  }

  private movementQuantityDelta(movement: {
    type: InventoryMovementType;
    quantity: number;
    beforeQuantity: number | null;
    afterQuantity: number | null;
    referenceType: string | null;
  }): number | null {
    if (movement.beforeQuantity !== null && movement.afterQuantity !== null) {
      return movement.afterQuantity - movement.beforeQuantity;
    }
    switch (movement.type) {
      case InventoryMovementType.ADJUSTMENT:
        return movement.quantity;
      case InventoryMovementType.STOCK_IN:
      case InventoryMovementType.PURCHASE:
      case InventoryMovementType.PRODUCTION:
      case InventoryMovementType.RETURN:
        return Math.abs(movement.quantity);
      case InventoryMovementType.SALE:
      case InventoryMovementType.WASTE:
      case InventoryMovementType.STOCK_OUT:
      case InventoryMovementType.CONSUMPTION:
        return -Math.abs(movement.quantity);
      case InventoryMovementType.TRANSFER:
        return movement.referenceType === 'WAREHOUSE_TRANSFER_RECEIPT'
          ? Math.abs(movement.quantity)
          : -Math.abs(movement.quantity);
      default:
        return null;
    }
  }

  async receive(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      inventoryItemId: string;
      warehouseId: string | null;
      quantity: number;
      unitCost?: Prisma.Decimal | number;
      sourceType: string;
      sourceReferenceId?: string | null;
      movementId: string;
    },
  ) {
    const item = await this.lockItem(tx, input.tenantId, input.inventoryItemId);
    const quantity = new Prisma.Decimal(input.quantity);
    if (
      item.valuationMethod !== InventoryValuationMethod.STANDARD_COST &&
      input.unitCost === undefined
    ) {
      throw new BadRequestException(
        'Unit cost is required for this inventory valuation method',
      );
    }
    const suppliedUnitCost = new Prisma.Decimal(input.unitCost ?? 0);
    const unitCost =
      item.valuationMethod === InventoryValuationMethod.STANDARD_COST
        ? item.standardCost!
        : suppliedUnitCost;
    const totalCost = quantity.mul(unitCost);

    if (item.valuationMethod === InventoryValuationMethod.FIFO) {
      await tx.inventoryCostLayer.create({
        data: {
          tenantId: input.tenantId,
          inventoryItemId: input.inventoryItemId,
          warehouseId: input.warehouseId,
          sourceMovementId: input.movementId,
          sourceType: input.sourceType,
          sourceReferenceId: input.sourceReferenceId,
          receivedQuantity: quantity,
          remainingQuantity: quantity,
          unitCost,
        },
      });
    } else if (
      item.valuationMethod === InventoryValuationMethod.MOVING_WEIGHTED_AVERAGE
    ) {
      await this.updateMovingAverage(tx, item, input, quantity, unitCost);
    }

    await tx.inventoryMovement.update({
      where: { id: input.movementId },
      data: { unitCost, totalCost },
    });
    if (!item.valuationLockedAt) {
      await tx.inventoryItem.update({
        where: { id: input.inventoryItemId },
        data: { valuationLockedAt: new Date() },
      });
    }
    return { unitCost, totalCost };
  }

  async issue(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      inventoryItemId: string;
      warehouseId: string | null;
      quantity: number;
      movementId: string;
    },
  ): Promise<InventoryIssueCost> {
    const item = await this.lockItem(tx, input.tenantId, input.inventoryItemId);
    const quantity = new Prisma.Decimal(input.quantity);
    let allocations: CostAllocation[];

    if (item.valuationMethod === InventoryValuationMethod.FIFO) {
      allocations = await this.consumeFifoLayers(tx, input, quantity);
    } else {
      const unitCost =
        item.valuationMethod === InventoryValuationMethod.STANDARD_COST
          ? item.standardCost!
          : await this.averageCost(tx, item, input.warehouseId);
      allocations = [
        { costLayerId: null, quantity, unitCost: new Prisma.Decimal(unitCost) },
      ];
    }

    const totalCost = allocations.reduce(
      (total, allocation) =>
        total.add(allocation.quantity.mul(allocation.unitCost)),
      new Prisma.Decimal(0),
    );
    const unitCost = totalCost.div(quantity);
    await tx.inventoryMovement.update({
      where: { id: input.movementId },
      data: { unitCost, totalCost },
    });
    await tx.inventoryMovementCostAllocation.createMany({
      data: allocations.map((allocation) => ({
        movementId: input.movementId,
        costLayerId: allocation.costLayerId,
        quantity: allocation.quantity,
        unitCost: allocation.unitCost,
      })),
    });
    if (!item.valuationLockedAt) {
      await tx.inventoryItem.update({
        where: { id: input.inventoryItemId },
        data: { valuationLockedAt: new Date() },
      });
    }
    return { unitCost, totalCost, allocations };
  }

  async receiveTransfer(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      inventoryItemId: string;
      warehouseId: string;
      quantity: number;
      alreadyReceived: number;
      sourceMovementId: string;
      movementId: string;
      sourceReferenceId: string;
    },
  ) {
    const item = await this.lockItem(tx, input.tenantId, input.inventoryItemId);
    const source = await tx.inventoryMovement.findUnique({
      where: { id: input.sourceMovementId },
    });
    if (
      source?.unitCost === null ||
      source?.unitCost === undefined ||
      source.totalCost === null ||
      source.totalCost === undefined
    ) {
      throw new BadRequestException(
        'Transfer source movement has no complete inventory cost',
      );
    }
    const quantity = new Prisma.Decimal(input.quantity);

    if (item.valuationMethod === InventoryValuationMethod.FIFO) {
      const sourceAllocations = await tx.$queryRaw<
        Array<{ quantity: Prisma.Decimal; unitCost: Prisma.Decimal }>
      >`
        SELECT allocation."quantity", allocation."unitCost"
        FROM "InventoryMovementCostAllocation" AS allocation
        LEFT JOIN "InventoryCostLayer" AS layer
          ON layer."id" = allocation."costLayerId"
        LEFT JOIN "InventoryMovement" AS source
          ON source."id" = layer."sourceMovementId"
        WHERE allocation."movementId" = ${input.sourceMovementId}
        ORDER BY COALESCE(source."createdAt", layer."createdAt") ASC NULLS LAST,
                 COALESCE(source."id", layer."id") ASC NULLS LAST,
                 allocation."id" ASC
      `;
      let skip = new Prisma.Decimal(input.alreadyReceived);
      let remaining = quantity;
      const copiedAllocations: CostAllocation[] = [];
      for (const allocation of sourceAllocations) {
        if (remaining.lte(0)) break;
        const allocatedQuantity = new Prisma.Decimal(allocation.quantity);
        if (skip.gte(allocatedQuantity)) {
          skip = skip.sub(allocatedQuantity);
          continue;
        }
        const available = allocatedQuantity.sub(skip);
        const copiedQuantity = Prisma.Decimal.min(available, remaining);
        copiedAllocations.push({
          costLayerId: null,
          quantity: copiedQuantity,
          unitCost: new Prisma.Decimal(allocation.unitCost),
        });
        remaining = remaining.sub(copiedQuantity);
        skip = new Prisma.Decimal(0);
      }
      if (remaining.gt(0)) {
        throw new BadRequestException(
          'Transfer cost allocation does not cover the received quantity',
        );
      }
      for (const allocation of copiedAllocations) {
        await tx.inventoryCostLayer.create({
          data: {
            tenantId: input.tenantId,
            inventoryItemId: input.inventoryItemId,
            warehouseId: input.warehouseId,
            sourceMovementId: input.movementId,
            sourceType: 'WAREHOUSE_TRANSFER_RECEIPT',
            sourceReferenceId: input.sourceReferenceId,
            receivedQuantity: allocation.quantity,
            remainingQuantity: allocation.quantity,
            unitCost: allocation.unitCost,
          },
        });
      }
      const totalCost = copiedAllocations.reduce(
        (total, allocation) =>
          total.add(allocation.quantity.mul(allocation.unitCost)),
        new Prisma.Decimal(0),
      );
      await tx.inventoryMovement.update({
        where: { id: input.movementId },
        data: { unitCost: totalCost.div(quantity), totalCost },
      });
    } else {
      await this.receive(tx, {
        tenantId: input.tenantId,
        inventoryItemId: input.inventoryItemId,
        warehouseId: input.warehouseId,
        quantity: input.quantity,
        unitCost: source.unitCost,
        sourceType: 'WAREHOUSE_TRANSFER_RECEIPT',
        sourceReferenceId: input.sourceReferenceId,
        movementId: input.movementId,
      });
    }
    if (!item.valuationLockedAt) {
      await tx.inventoryItem.update({
        where: { id: input.inventoryItemId },
        data: { valuationLockedAt: new Date() },
      });
    }
  }

  async restore(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      inventoryItemId: string;
      warehouseId: string | null;
      quantity: number;
      sourceMovementId: string;
      reversalMovementId: string;
    },
  ) {
    const item = await this.lockItem(tx, input.tenantId, input.inventoryItemId);
    const allocations = await tx.inventoryMovementCostAllocation.findMany({
      where: { movementId: input.sourceMovementId },
      orderBy: { id: 'asc' },
    });
    if (allocations.length === 0) {
      throw new BadRequestException(
        'Cost allocation is missing for the reserved stock movement',
      );
    }
    if (item.valuationMethod === InventoryValuationMethod.FIFO) {
      for (const allocation of allocations) {
        if (!allocation.costLayerId) {
          throw new BadRequestException(
            'FIFO cost layer is missing for the reserved stock movement',
          );
        }
        await tx.inventoryCostLayer.update({
          where: { id: allocation.costLayerId },
          data: { remainingQuantity: { increment: allocation.quantity } },
        });
      }
    } else if (
      item.valuationMethod === InventoryValuationMethod.MOVING_WEIGHTED_AVERAGE
    ) {
      const restoredValue = allocations.reduce(
        (total, allocation) =>
          total.add(allocation.quantity.mul(allocation.unitCost)),
        new Prisma.Decimal(0),
      );
      await this.restoreMovingAverage(
        tx,
        item,
        input,
        new Prisma.Decimal(input.quantity),
        restoredValue,
      );
    }
    await tx.inventoryMovementCostAllocation.createMany({
      data: allocations.map((allocation) => ({
        movementId: input.reversalMovementId,
        costLayerId: allocation.costLayerId,
        quantity: allocation.quantity,
        unitCost: allocation.unitCost,
      })),
    });
    const totalCost = allocations.reduce(
      (total, allocation) =>
        total.add(allocation.quantity.mul(allocation.unitCost)),
      new Prisma.Decimal(0),
    );
    await tx.inventoryMovement.update({
      where: { id: input.reversalMovementId },
      data: {
        unitCost: totalCost.div(new Prisma.Decimal(input.quantity)),
        totalCost,
      },
    });
  }

  private async consumeFifoLayers(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      inventoryItemId: string;
      warehouseId: string | null;
    },
    quantity: Prisma.Decimal,
  ): Promise<CostAllocation[]> {
    const layers = await tx.$queryRaw<
      Array<{
        id: string;
        remainingQuantity: Prisma.Decimal;
        unitCost: Prisma.Decimal;
      }>
    >`
      SELECT layer."id", layer."remainingQuantity", layer."unitCost"
      FROM "InventoryCostLayer" AS layer
      LEFT JOIN "InventoryMovement" AS source
        ON source."id" = layer."sourceMovementId"
      WHERE layer."tenantId" = ${input.tenantId}
        AND layer."inventoryItemId" = ${input.inventoryItemId}
        AND layer."warehouseId" IS NOT DISTINCT FROM ${input.warehouseId}
        AND layer."remainingQuantity" > 0
      ORDER BY COALESCE(source."createdAt", layer."createdAt") ASC,
               COALESCE(source."id", layer."id") ASC, layer."id" ASC
      FOR UPDATE OF layer
    `;
    let remaining = quantity;
    const allocations: CostAllocation[] = [];
    for (const layer of layers) {
      if (remaining.lte(0)) break;
      const available = new Prisma.Decimal(layer.remainingQuantity);
      const consumed = Prisma.Decimal.min(available, remaining);
      await tx.inventoryCostLayer.update({
        where: { id: layer.id },
        data: { remainingQuantity: { decrement: consumed } },
      });
      allocations.push({
        costLayerId: layer.id,
        quantity: consumed,
        unitCost: new Prisma.Decimal(layer.unitCost),
      });
      remaining = remaining.sub(consumed);
    }
    if (remaining.gt(0)) {
      throw new BadRequestException(
        'FIFO cost layers do not cover the requested stock issue; enter opening costs before continuing',
      );
    }
    return allocations;
  }

  private async averageCost(
    tx: Prisma.TransactionClient,
    item: {
      id: string;
      valuationMethod: InventoryValuationMethod | null;
      movingAverageScope: MovingAverageScope | null;
      averageUnitCost: Prisma.Decimal | null;
    },
    warehouseId: string | null,
  ) {
    if (item.movingAverageScope === MovingAverageScope.PER_ITEM) {
      if (!item.averageUnitCost) {
        throw new BadRequestException(
          'Opening cost is required before issuing this inventory item',
        );
      }
      return item.averageUnitCost;
    }
    const stock = await tx.inventoryStock.findFirst({
      where: { warehouseId, inventoryItemId: item.id },
      select: { averageUnitCost: true, quantity: true },
    });
    if (!stock?.averageUnitCost) {
      throw new BadRequestException(
        'Opening cost is required before issuing stock from this warehouse',
      );
    }
    return stock.averageUnitCost;
  }

  private async updateMovingAverage(
    tx: Prisma.TransactionClient,
    item: {
      id: string;
      movingAverageScope: MovingAverageScope | null;
      averageUnitCost: Prisma.Decimal | null;
    },
    input: {
      inventoryItemId: string;
      warehouseId: string | null;
      quantity: number;
    },
    quantity: Prisma.Decimal,
    unitCost: Prisma.Decimal,
  ) {
    if (item.movingAverageScope === MovingAverageScope.PER_ITEM) {
      const stocks = await tx.inventoryStock.findMany({
        where: { inventoryItemId: item.id },
        select: { quantity: true },
      });
      const totalQuantity = stocks.reduce(
        (total, stock) => total + stock.quantity,
        0,
      );
      const previousQuantity = totalQuantity - input.quantity;
      if (previousQuantity > 0 && !item.averageUnitCost) {
        throw new BadRequestException(
          'Opening cost is required before receiving additional stock',
        );
      }
      const previousValue = new Prisma.Decimal(previousQuantity).mul(
        item.averageUnitCost ?? 0,
      );
      const average = previousValue
        .add(quantity.mul(unitCost))
        .div(totalQuantity);
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { averageUnitCost: average },
      });
      return;
    }
    const stock = await tx.inventoryStock.findFirst({
      where: { inventoryItemId: item.id, warehouseId: input.warehouseId },
      select: { quantity: true, averageUnitCost: true },
    });
    const previousQuantity = (stock?.quantity ?? 0) - input.quantity;
    if (previousQuantity > 0 && !stock?.averageUnitCost) {
      throw new BadRequestException(
        'Opening cost is required before receiving additional stock',
      );
    }
    const previousValue = new Prisma.Decimal(previousQuantity).mul(
      stock?.averageUnitCost ?? 0,
    );
    const average = previousValue
      .add(quantity.mul(unitCost))
      .div(new Prisma.Decimal(stock?.quantity ?? input.quantity));
    await tx.inventoryStock.updateMany({
      where: { inventoryItemId: item.id, warehouseId: input.warehouseId },
      data: { averageUnitCost: average },
    });
  }

  private async restoreMovingAverage(
    tx: Prisma.TransactionClient,
    item: {
      id: string;
      movingAverageScope: MovingAverageScope | null;
      averageUnitCost: Prisma.Decimal | null;
    },
    input: {
      inventoryItemId: string;
      warehouseId: string | null;
    },
    quantity: Prisma.Decimal,
    value: Prisma.Decimal,
  ) {
    if (item.movingAverageScope === MovingAverageScope.PER_ITEM) {
      const stocks = await tx.inventoryStock.findMany({
        where: { inventoryItemId: item.id },
        select: { quantity: true },
      });
      const totalQuantity = stocks.reduce(
        (total, stock) => total + stock.quantity,
        0,
      );
      const previousQuantity = new Prisma.Decimal(totalQuantity).sub(quantity);
      const previousValue = previousQuantity.mul(item.averageUnitCost ?? 0);
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: {
          averageUnitCost: previousValue.add(value).div(totalQuantity),
        },
      });
      return;
    }
    const stock = await tx.inventoryStock.findFirst({
      where: { inventoryItemId: item.id, warehouseId: input.warehouseId },
      select: { quantity: true, averageUnitCost: true },
    });
    if (!stock || stock.quantity <= 0) {
      throw new BadRequestException('Restored stock balance was not found');
    }
    const previousQuantity = new Prisma.Decimal(stock.quantity).sub(quantity);
    const previousValue = previousQuantity.mul(stock.averageUnitCost ?? 0);
    await tx.inventoryStock.updateMany({
      where: { inventoryItemId: item.id, warehouseId: input.warehouseId },
      data: {
        averageUnitCost: previousValue.add(value).div(stock.quantity),
      },
    });
  }
}
