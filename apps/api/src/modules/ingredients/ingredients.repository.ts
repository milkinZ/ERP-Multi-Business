import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';
import { IngredientAggregate } from './domain/ingredient.aggregate';

@Injectable()
export class IngredientsRepository extends BaseRepository {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async createIngredient(data: {
    tenantId: string;
    name: string;
    unit: string;
    inventoryItemId: string;
  }) {
    const aggregate = IngredientAggregate.create({
      id: `ING-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: data.name,
      unit: data.unit,
      tenantId: data.tenantId,
      inventoryItemId: data.inventoryItemId,
      createdAt: new Date(),
      //   updatedAt: new Date(),
    });

    const persisted = await this.prisma.ingredient.create({
      data: {
        name: aggregate['name'],
        unit: aggregate['unit'],
        tenantId: aggregate['tenantId'],
        inventoryItemId: aggregate['inventoryItemId'],
      },
      include: { InventoryItem: true },
    });

    return IngredientAggregate.fromPersistence(persisted);
  }

  findAll(tenantId: string) {
    return this.prisma.ingredient.findMany({
      where: { tenantId },
      include: { InventoryItem: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string, tenantId: string) {
    return this.prisma.ingredient.findFirst({
      where: { id, tenantId },
      include: { InventoryItem: true },
    });
  }
}
