import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryItemType, Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { IngredientsRepository } from './ingredients.repository';
import { ListIngredientsQueryDto } from './dto/list-ingredients-query.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';
import {
  assertUnitConversionCanBeAdded,
  resolveUnitConversionFactor,
} from './unit-conversion';

@Injectable()
export class IngredientsService {
  constructor(
    private prisma: PrismaService,
    private readonly ingredientsRepository: IngredientsRepository,
  ) {}

  async create(tenantId: string, data: { name: string; unit: string }) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.inventoryItem.findFirst({
        where: {
          tenantId,
          type: InventoryItemType.INGREDIENT,
          name: { equals: data.name, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (existing) {
        throw new BadRequestException('Ingredient already exists');
      }

      return this.ingredientsRepository.createIngredient(
        { tenantId, name: data.name, unit: data.unit },
        tx,
      );
    });
  }

  findAll(tenantId: string, query: ListIngredientsQueryDto) {
    return this.ingredientsRepository.findAll(tenantId, query);
  }

  findOne(id: string, tenantId: string) {
    return this.ingredientsRepository.findOne(id, tenantId);
  }

  async update(id: string, tenantId: string, data: UpdateIngredientDto) {
    if (
      data.name === undefined &&
      data.unit === undefined &&
      data.isActive === undefined
    ) {
      throw new BadRequestException(
        'At least one ingredient field is required',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const item = await tx.inventoryItem.findFirst({
          where: { id, tenantId, type: InventoryItemType.INGREDIENT },
        });
        if (!item) {
          throw new NotFoundException('Ingredient not found');
        }

        if (data.unit !== undefined && data.unit !== item.unit) {
          throw new BadRequestException(
            'Use the audited unit conversion operation to change an ingredient unit',
          );
        }

        if (data.name !== undefined && data.name !== item.name) {
          const duplicate = await tx.inventoryItem.findFirst({
            where: {
              tenantId,
              type: InventoryItemType.INGREDIENT,
              id: { not: id },
              name: { equals: data.name, mode: 'insensitive' },
            },
            select: { id: true },
          });
          if (duplicate) {
            throw new BadRequestException('Ingredient already exists');
          }
        }

        const updated = await tx.inventoryItem.update({
          where: { id },
          data: {
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          },
        });
        return this.ingredientsRepository.toIngredient(updated);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async listUnitConversions(tenantId: string) {
    return this.prisma.tenantUnitConversion.findMany({
      where: { tenantId },
      orderBy: [{ fromUnit: 'asc' }, { toUnit: 'asc' }],
    });
  }

  async createUnitConversion(
    tenantId: string,
    userId: string,
    data: { fromUnit: string; toUnit: string; factor: number },
  ) {
    const fromUnit = data.fromUnit.trim().toLocaleLowerCase('en-US');
    const toUnit = data.toUnit.trim().toLocaleLowerCase('en-US');
    if (fromUnit === toUnit) {
      throw new BadRequestException('Conversion units must be different');
    }

    return this.prisma.$transaction(async (tx) => {
      const currentRules = await tx.tenantUnitConversion.findMany({
        where: { tenantId },
        select: { fromUnit: true, toUnit: true, factor: true },
      });
      assertUnitConversionCanBeAdded(fromUnit, toUnit, currentRules);

      const conversion = await tx.tenantUnitConversion.create({
        data: {
          tenantId,
          fromUnit,
          toUnit,
          factor: new Prisma.Decimal(data.factor),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          entity: 'TenantUnitConversion',
          entityId: conversion.id,
          action: 'UNIT_CONVERSION_CREATED',
          metadata: {
            fromUnit,
            toUnit,
            factor: data.factor,
          },
        },
      });
      return conversion;
    });
  }

  async convertUnit(
    id: string,
    tenantId: string,
    userId: string,
    data: { unit: string; convertHistory: boolean },
  ) {
    const newUnit = data.unit.trim();
    const normalizedNewUnit = newUnit.toLocaleLowerCase('en-US');
    if (!normalizedNewUnit) {
      throw new BadRequestException('Unit must not be empty');
    }

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT recipe."id"
          FROM "Recipe" AS recipe
          JOIN "RecipeItem" AS recipe_item
            ON recipe_item."recipeId" = recipe."id"
          WHERE recipe."tenantId" = ${tenantId}
            AND recipe_item."inventoryItemId" = ${id}
            AND (recipe."isActive" = true OR ${data.convertHistory})
          ORDER BY recipe."id"
          FOR UPDATE OF recipe
        `;
        const [item] = await tx.$queryRaw<
          Array<{ id: string; unit: string | null }>
        >`
          SELECT "id", "unit"
          FROM "InventoryItem"
          WHERE "id" = ${id}
            AND "tenantId" = ${tenantId}
            AND "type" = 'INGREDIENT'
          FOR UPDATE
        `;
        if (!item) throw new NotFoundException('Ingredient not found');
        const oldUnit = item.unit?.trim();
        if (!oldUnit) {
          throw new BadRequestException(
            'An ingredient must have a unit before it can be converted',
          );
        }
        if (oldUnit.toLocaleLowerCase('en-US') === normalizedNewUnit) {
          throw new BadRequestException(
            'The new unit must differ from the current unit',
          );
        }

        const rules = await tx.tenantUnitConversion.findMany({
          where: { tenantId },
          select: { fromUnit: true, toUnit: true, factor: true },
        });
        const resolvedFactor = resolveUnitConversionFactor(
          oldUnit,
          newUnit,
          rules,
        );
        if (!resolvedFactor) {
          throw new BadRequestException(
            `No configured conversion exists from ${oldUnit} to ${newUnit}`,
          );
        }
        const factor = resolvedFactor.toDecimalPlaces(12);
        if (factor.lte(0)) {
          throw new BadRequestException(
            'The configured conversion factor is too small to store accurately',
          );
        }

        await tx.$executeRaw`
          UPDATE "InventoryStock"
          SET "quantity" = ROUND("quantity"::numeric * ${factor}, 6)::double precision,
              "averageUnitCost" = "averageUnitCost" / ${factor},
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "inventoryItemId" = ${id}
        `;
        await tx.$executeRaw`
          UPDATE "InventoryItem"
          SET "unit" = ${newUnit},
              "standardCost" = "standardCost" / ${factor},
              "averageUnitCost" = "averageUnitCost" / ${factor}
          WHERE "id" = ${id} AND "tenantId" = ${tenantId}
        `;
        await tx.$executeRaw`
          UPDATE "InventoryReorderRule"
          SET "reorderPoint" = ROUND("reorderPoint"::numeric * ${factor}, 6)::double precision,
              "targetStock" = CASE WHEN "targetStock" IS NULL THEN NULL ELSE ROUND("targetStock"::numeric * ${factor}, 6)::double precision END,
              "fixedOrderQuantity" = CASE WHEN "fixedOrderQuantity" IS NULL THEN NULL ELSE ROUND("fixedOrderQuantity"::numeric * ${factor}, 6)::double precision END
          WHERE "inventoryItemId" = ${id} AND "tenantId" = ${tenantId}
        `;
        await tx.$executeRaw`
          UPDATE "RecipeItem" AS recipe_item
          SET "quantity" = ROUND(recipe_item."quantity"::numeric * ${factor}, 6)::double precision,
              "unit" = ${newUnit}
          FROM "Recipe" AS recipe
          WHERE recipe_item."inventoryItemId" = ${id}
            AND recipe_item."recipeId" = recipe."id"
            AND (recipe."isActive" = true OR ${data.convertHistory})
        `;
        await tx.$executeRaw`
          UPDATE "InventoryCostLayer"
          SET "receivedQuantity" = "receivedQuantity" * ${factor},
              "remainingQuantity" = "remainingQuantity" * ${factor},
              "unitCost" = "unitCost" / ${factor},
              "unit" = ${newUnit}
          WHERE "inventoryItemId" = ${id}
            AND ("remainingQuantity" > 0 OR ${data.convertHistory})
        `;
        await tx.$executeRaw`
          UPDATE "InventoryMovement"
          SET "quantity" = ROUND("quantity"::numeric * ${factor}, 6)::double precision,
              "beforeQuantity" = CASE WHEN "beforeQuantity" IS NULL THEN NULL ELSE ROUND("beforeQuantity"::numeric * ${factor}, 6)::double precision END,
              "afterQuantity" = CASE WHEN "afterQuantity" IS NULL THEN NULL ELSE ROUND("afterQuantity"::numeric * ${factor}, 6)::double precision END,
              "unitCost" = "unitCost" / ${factor},
              "unit" = ${newUnit}
          WHERE "inventoryItemId" = ${id}
            AND (
              "referenceType" = 'ORDER_RESERVATION'
              OR EXISTS (
                SELECT 1
                FROM "SalesOrder" AS sales_order
                WHERE sales_order."id" = "InventoryMovement"."referenceId"
                  AND sales_order."tenantId" = ${tenantId}
                  AND sales_order."status" IN ('PENDING', 'PAID', 'IN_PROGRESS', 'READY')
              )
              OR ${data.convertHistory}
            )
        `;
        await tx.$executeRaw`
          UPDATE "InventoryMovementCostAllocation" AS allocation
          SET "quantity" = allocation."quantity" * ${factor},
              "unitCost" = allocation."unitCost" / ${factor},
              "unit" = ${newUnit}
          FROM "InventoryMovement" AS movement
          WHERE allocation."movementId" = movement."id"
            AND movement."inventoryItemId" = ${id}
            AND (
              movement."referenceType" = 'ORDER_RESERVATION'
              OR EXISTS (
                SELECT 1
                FROM "SalesOrder" AS sales_order
                WHERE sales_order."id" = movement."referenceId"
                  AND sales_order."tenantId" = ${tenantId}
                  AND sales_order."status" IN ('PENDING', 'PAID', 'IN_PROGRESS', 'READY')
              )
              OR ${data.convertHistory}
            )
        `;
        await tx.$executeRaw`
          UPDATE "PurchaseOrderItem" AS item
          SET "quantity" = ROUND(item."quantity"::numeric * ${factor}, 6)::double precision,
              "receivedQuantity" = ROUND(item."receivedQuantity"::numeric * ${factor}, 6)::double precision,
              "unitPrice" = item."unitPrice" / ${factor},
              "unit" = ${newUnit}
          FROM "PurchaseOrder" AS purchase_order
          WHERE item."inventoryItemId" = ${id}
            AND item."purchaseOrderId" = purchase_order."id"
            AND (
              purchase_order."status" IN ('DRAFT', 'PENDING', 'APPROVED', 'PARTIALLY_RECEIVED')
              OR ${data.convertHistory}
            )
        `;
        await tx.$executeRaw`
          UPDATE "PurchaseOrderReceiptItem" AS receipt_item
          SET "receivedQuantity" = ROUND(receipt_item."receivedQuantity"::numeric * ${factor}, 6)::double precision,
              "unit" = ${newUnit}
          FROM "PurchaseOrderItem" AS po_item
          JOIN "PurchaseOrder" AS purchase_order
            ON po_item."purchaseOrderId" = purchase_order."id"
          WHERE receipt_item."purchaseOrderItemId" = po_item."id"
            AND receipt_item."inventoryItemId" = ${id}
            AND (
              purchase_order."status" IN ('DRAFT', 'PENDING', 'APPROVED', 'PARTIALLY_RECEIVED')
              OR ${data.convertHistory}
            )
        `;
        await tx.$executeRaw`
          UPDATE "InventoryPurchasePriceVariance"
          SET "quantity" = "quantity" * ${factor},
              "standardUnitCost" = "standardUnitCost" / ${factor},
              "actualUnitCost" = "actualUnitCost" / ${factor},
              "unit" = ${newUnit}
          WHERE "inventoryItemId" = ${id} AND ${data.convertHistory}
        `;
        await tx.$executeRaw`
          UPDATE "WarehouseTransferItem" AS item
          SET "quantity" = ROUND(item."quantity"::numeric * ${factor}, 6)::double precision,
              "receivedQuantity" = ROUND(item."receivedQuantity"::numeric * ${factor}, 6)::double precision,
              "unit" = ${newUnit}
          FROM "WarehouseTransfer" AS transfer
          WHERE item."inventoryItemId" = ${id}
            AND item."transferId" = transfer."id"
            AND (
              transfer."status" IN ('PENDING', 'IN_TRANSIT', 'PARTIALLY_RECEIVED')
              OR ${data.convertHistory}
            )
        `;
        await tx.$executeRaw`
          UPDATE "WarehouseTransferReceiptItem" AS receipt_item
          SET "receivedQuantity" = ROUND(receipt_item."receivedQuantity"::numeric * ${factor}, 6)::double precision,
              "unit" = ${newUnit}
          FROM "WarehouseTransferItem" AS transfer_item
          JOIN "WarehouseTransfer" AS transfer
            ON transfer_item."transferId" = transfer."id"
          WHERE receipt_item."transferItemId" = transfer_item."id"
            AND receipt_item."inventoryItemId" = ${id}
            AND (
              transfer."status" IN ('PENDING', 'IN_TRANSIT', 'PARTIALLY_RECEIVED')
              OR ${data.convertHistory}
            )
        `;
        await tx.$executeRaw`
          UPDATE "SalesOrderRecipeSnapshotItem" AS snapshot_item
          SET "quantity" = ROUND(snapshot_item."quantity"::numeric * ${factor}, 6)::double precision,
              "unit" = ${newUnit},
              "inventoryUnit" = ${newUnit}
          FROM "SalesOrderRecipeSnapshot" AS snapshot
          WHERE snapshot_item."snapshotId" = snapshot."id"
            AND snapshot_item."inventoryItemId" = ${id}
            AND (
              EXISTS (
                SELECT 1
                FROM "SalesOrderItem" AS order_item
                JOIN "SalesOrder" AS sales_order
                  ON sales_order."id" = order_item."orderId"
                WHERE order_item."id" = snapshot."orderItemId"
                  AND sales_order."tenantId" = ${tenantId}
                  AND sales_order."status" IN ('PENDING', 'PAID', 'IN_PROGRESS', 'READY')
              )
              OR ${data.convertHistory}
            )
        `;

        const conversion = await tx.inventoryUnitConversion.create({
          data: {
            tenantId,
            inventoryItemId: id,
            fromUnit: oldUnit,
            toUnit: newUnit,
            factor,
            convertHistory: data.convertHistory,
            createdById: userId,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            entity: 'InventoryItem',
            entityId: id,
            action: 'INGREDIENT_UNIT_CONVERTED',
            metadata: {
              fromUnit: oldUnit,
              toUnit: newUnit,
              factor: factor.toNumber(),
              convertHistory: data.convertHistory,
            },
          },
        });

        return {
          id,
          fromUnit: oldUnit,
          unit: newUnit,
          factor: factor.toString(),
          convertHistory: data.convertHistory,
          conversionId: conversion.id,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async remove(id: string, tenantId: string) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const item = await tx.inventoryItem.findFirst({
            where: { id, tenantId, type: InventoryItemType.INGREDIENT },
            select: { id: true },
          });
          if (!item) {
            throw new NotFoundException('Ingredient not found');
          }

          if (await this.hasReferences(tx, id)) {
            const deactivated = await tx.inventoryItem.updateMany({
              where: { id, tenantId, type: InventoryItemType.INGREDIENT },
              data: { isActive: false },
            });
            if (deactivated.count !== 1) {
              throw new NotFoundException('Ingredient not found');
            }
            return { success: true, deactivated: true };
          }

          const deleted = await tx.inventoryItem.deleteMany({
            where: { id, tenantId, type: InventoryItemType.INGREDIENT },
          });
          if (deleted.count !== 1) {
            throw new NotFoundException('Ingredient not found');
          }
          return { success: true, deactivated: false };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2003'
      ) {
        throw error;
      }

      const deactivated = await this.prisma.inventoryItem.updateMany({
        where: { id, tenantId, type: InventoryItemType.INGREDIENT },
        data: { isActive: false },
      });
      if (deactivated.count !== 1) {
        throw new NotFoundException('Ingredient not found');
      }
      return { success: true, deactivated: true };
    }
  }

  private async hasReferences(
    client: Prisma.TransactionClient,
    inventoryItemId: string,
  ) {
    const checks = await Promise.all([
      client.recipeItem.findFirst({
        where: { inventoryItemId },
        select: { id: true },
      }),
      client.inventoryStock.findFirst({
        where: { inventoryItemId },
        select: { id: true },
      }),
      client.inventoryMovement.findFirst({
        where: { inventoryItemId },
        select: { id: true },
      }),
      client.product.findFirst({
        where: { inventoryItemId },
        select: { id: true },
      }),
      client.purchaseOrderItem.findFirst({
        where: { inventoryItemId },
        select: { id: true },
      }),
      client.purchaseOrderReceiptItem.findFirst({
        where: { inventoryItemId },
        select: { id: true },
      }),
      client.warehouseTransferItem.findFirst({
        where: { inventoryItemId },
        select: { id: true },
      }),
      client.warehouseTransferReceiptItem.findFirst({
        where: { inventoryItemId },
        select: { id: true },
      }),
    ]);
    return checks.some(Boolean);
  }
}
