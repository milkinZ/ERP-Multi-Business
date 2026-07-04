import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';
import { RecipeAggregate } from './domain/recipe.aggregate';

export type RecipeWithItems = Prisma.RecipeGetPayload<{
  include: {
    Product: true;
    RecipeItem: {
      include: {
        Ingredient: true;
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
    items: { ingredientId: string; quantity: number }[];
  }) {
    const aggregate = RecipeAggregate.create({
      id: `RC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      tenantId: data.tenantId,
      productId: data.productId,
      items: data.items,
      createdAt: new Date(),
    });

    const persisted = await this.prisma.recipe.create({
      data: {
        tenantId: aggregate.tenantId,
        productId: aggregate.productId,
        RecipeItem: {
          create: aggregate.items.map((item) => ({
            ingredientId: item.ingredientId,
            quantity: item.quantity,
          })),
        },
      },
      include: {
        Product: true,
        RecipeItem: {
          include: {
            Ingredient: true,
          },
        },
      },
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
            Ingredient: true,
          },
        },
      },
    }) as Promise<RecipeWithItems | null>;
  }
}
