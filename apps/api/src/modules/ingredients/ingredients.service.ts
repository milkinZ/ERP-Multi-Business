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

        if (data.unit !== undefined && data.unit !== item.unit) {
          const [stock, movement, recipeUsage] = await Promise.all([
            tx.inventoryStock.findFirst({
              where: {
                inventoryItemId: id,
                quantity: { not: 0 },
              },
              select: { id: true },
            }),
            tx.inventoryMovement.findFirst({
              where: { inventoryItemId: id },
              select: { id: true },
            }),
            tx.recipeItem.findFirst({
              where: { inventoryItemId: id },
              select: { id: true },
            }),
          ]);
          if (stock || movement || recipeUsage) {
            throw new BadRequestException(
              'Ingredient unit cannot change after stock, movement, or recipe usage exists',
            );
          }
        }

        const updated = await tx.inventoryItem.update({
          where: { id },
          data: {
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.unit !== undefined ? { unit: data.unit } : {}),
            ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          },
        });
        return this.ingredientsRepository.toIngredient(updated);
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
