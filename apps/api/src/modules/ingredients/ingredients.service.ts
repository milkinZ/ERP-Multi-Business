import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { InventoryItemType } from '@prisma/client';

@Injectable()
export class IngredientsService {
  constructor(private prisma: PrismaService) {}

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

      const ingredient = await tx.ingredient.create({
        data: {
          name: data.name,
          unit: data.unit,
          tenantId,
          inventoryItemId: inventoryItem.id,
        },
        include: {
          InventoryItem: true,
        },
      });

      return ingredient;
    });
  }

  findAll(tenantId: string) {
    return this.prisma.ingredient.findMany({
      where: {
        tenantId,
      },

      include: {
        InventoryItem: true,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  findOne(id: string, tenantId: string) {
    return this.prisma.ingredient.findFirst({
      where: {
        id,
        tenantId,
      },

      include: {
        InventoryItem: true,
      },
    });
  }
}
