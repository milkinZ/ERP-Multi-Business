import { Injectable } from '@nestjs/common';
import { InventoryItemType, Prisma } from '@prisma/client';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';
import { ListIngredientsQueryDto } from './dto/list-ingredients-query.dto';

type IngredientInventoryItem =
  Prisma.InventoryItemGetPayload<Prisma.InventoryItemDefaultArgs>;

@Injectable()
export class IngredientsRepository extends BaseRepository {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  toIngredient(item: IngredientInventoryItem) {
    return {
      id: item.id,
      name: item.name,
      unit: item.unit ?? '',
      tenantId: item.tenantId,
      inventoryItemId: item.id,
      createdAt: item.createdAt,
      InventoryItem: item,
    };
  }

  async createIngredient(
    data: { tenantId: string; name: string; unit: string },
    client: Prisma.TransactionClient = this.prisma,
  ) {
    const item = await client.inventoryItem.create({
      data: {
        code: `ING-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: data.name,
        unit: data.unit,
        type: InventoryItemType.INGREDIENT,
        tenantId: data.tenantId,
      },
    });

    return this.toIngredient(item);
  }

  async findAll(tenantId: string, query: ListIngredientsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();
    const where: Prisma.InventoryItemWhereInput = {
      tenantId,
      type: InventoryItemType.INGREDIENT,
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { unit: { contains: search, mode: 'insensitive' } },
              { code: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);

    return {
      data: items.map((item) => this.toIngredient(item)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, tenantId: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, tenantId, type: InventoryItemType.INGREDIENT },
    });
    return item ? this.toIngredient(item) : null;
  }
}
