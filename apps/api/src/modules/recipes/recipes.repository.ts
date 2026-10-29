import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryItemType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';
import { RecipeAggregate } from './domain/recipe.aggregate';
import { ListRecipesQueryDto } from './dto/list-recipes-query.dto';

export type RecipeWithItems = Prisma.RecipeGetPayload<{
  include: {
    Product: true;
    RecipeItem: {
      include: {
        InventoryItem: true;
      };
    };
  };
}>;

@Injectable()
export class RecipesRepository extends BaseRepository {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async createRecipe(data: {
    tenantId: string;
    productId: string;
    items: { inventoryItemId: string; quantity: number }[];
  }) {
    const aggregate = RecipeAggregate.create({
      id: `RC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      tenantId: data.tenantId,
      productId: data.productId,
      items: data.items,
      createdAt: new Date(),
    });

    const persisted = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: aggregate.productId, tenantId: aggregate.tenantId },
      });
      if (!product) throw new BadRequestException('Product not found');

      const inventoryItems = await tx.inventoryItem.findMany({
        where: {
          id: { in: aggregate.items.map((item) => item.inventoryItemId) },
          tenantId: aggregate.tenantId,
          type: InventoryItemType.INGREDIENT,
          isActive: true,
        },
      });
      if (inventoryItems.length !== aggregate.items.length) {
        throw new BadRequestException(
          'Inventory item not found, inactive, or not an ingredient',
        );
      }

      return tx.recipe.create({
        data: {
          tenantId: aggregate.tenantId,
          productId: aggregate.productId,
          RecipeItem: {
            create: aggregate.items.map((item) => ({
              inventoryItemId: item.inventoryItemId,
              quantity: item.quantity,
            })),
          },
        },
        include: {
          Product: true,
          RecipeItem: {
            include: {
              InventoryItem: true,
            },
          },
        },
      });
    });

    return persisted;
  }

  async findByProduct(productId: string, tenantId: string) {
    return this.prisma.recipe.findFirst({
      where: { productId, tenantId },
      include: {
        Product: true,
        RecipeItem: {
          include: {
            InventoryItem: true,
          },
        },
      },
    }) as Promise<RecipeWithItems | null>;
  }

  async findAll(tenantId: string, query: ListRecipesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();
    const where: Prisma.RecipeWhereInput = {
      tenantId,
      Product: {
        is: {
          tenantId,
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: 'insensitive' } },
                  { sku: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
      },
    };
    const [data, total] = await Promise.all([
      this.prisma.recipe.findMany({
        where,
        select: {
          id: true,
          tenantId: true,
          productId: true,
          createdAt: true,
          Product: {
            select: {
              id: true,
              name: true,
              sku: true,
              isActive: true,
            },
          },
          _count: { select: { RecipeItem: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.recipe.count({ where }),
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

  async findByInventoryItem(
    inventoryItemId: string,
    tenantId: string,
    query: ListRecipesQueryDto,
  ) {
    const inventoryItem = await this.prisma.inventoryItem.findFirst({
      where: {
        id: inventoryItemId,
        tenantId,
        type: InventoryItemType.INGREDIENT,
      },
      select: { id: true },
    });
    if (!inventoryItem) {
      throw new NotFoundException('Ingredient inventory item not found');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();
    const where: Prisma.RecipeItemWhereInput = {
      inventoryItemId,
      InventoryItem: {
        is: { tenantId, type: InventoryItemType.INGREDIENT },
      },
      Recipe: {
        is: {
          tenantId,
          Product: {
            is: {
              tenantId,
              ...(search
                ? {
                    OR: [
                      { name: { contains: search, mode: 'insensitive' } },
                      { sku: { contains: search, mode: 'insensitive' } },
                    ],
                  }
                : {}),
            },
          },
        },
      },
    };
    const [data, total] = await Promise.all([
      this.prisma.recipeItem.findMany({
        where,
        select: {
          id: true,
          recipeId: true,
          inventoryItemId: true,
          quantity: true,
          Recipe: {
            select: {
              id: true,
              createdAt: true,
              Product: {
                select: { id: true, name: true, sku: true },
              },
            },
          },
        },
        orderBy: [
          { Recipe: { createdAt: 'desc' } },
          { recipeId: 'asc' },
          { id: 'asc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.recipeItem.count({ where }),
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
}
