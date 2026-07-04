import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { InventoryItemType } from '@prisma/client';
import { IngredientsRepository } from './ingredients.repository';

@Injectable()
export class IngredientsService {
  constructor(
    private prisma: PrismaService,
    private readonly ingredientsRepository: IngredientsRepository,
  ) {}

  async create(
    tenantId: string,
    data: {
      name: string;
      unit: string;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const inventoryItem = await tx.inventoryItem.create({
        data: {
          code: `ING-${new Date().getTime()}-${Math.floor(Math.random() * 1000)}`,
          name: data.name,
          unit: data.unit,
          type: InventoryItemType.INGREDIENT,
          tenantId,
        },
      });

      const existing = await tx.ingredient.findFirst({
        where: {
          tenantId,
          name: data.name,
        },
      });

      if (existing) {
        throw new BadRequestException('Ingredient already exists');
      }

      // Delegate persistence to repository to keep service thin
      const ingredient = await this.ingredientsRepository.createIngredient({
        tenantId,
        name: data.name,
        unit: data.unit,
        inventoryItemId: inventoryItem.id,
      });

      return ingredient;
    });
  }

  findAll(tenantId: string) {
    return this.ingredientsRepository.findAll(tenantId);
  }

  findOne(id: string, tenantId: string) {
    return this.ingredientsRepository.findOne(id, tenantId);
  }
}
