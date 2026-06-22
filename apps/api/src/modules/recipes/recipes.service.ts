import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class RecipesService {
  constructor(private prisma: PrismaService) {}

  async create(
    tenantId: string,
    dto: {
      productId: string;

      items: {
        ingredientId: string;
        quantity: number;
      }[];
    },
  ) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: dto.productId,
        tenantId,
      },
    });

    if (!product) {
      throw new BadRequestException('Product not found');
    }

    const existingRecipe = await this.prisma.recipe.findUnique({
      where: {
        productId: dto.productId,
      },
    });

    if (existingRecipe) {
      throw new BadRequestException('Recipe already exists');
    }

    const uniqueIds = new Set(dto.items.map((item) => item.ingredientId));

    if (uniqueIds.size !== dto.items.length) {
      throw new BadRequestException('Duplicate ingredients detected');
    }

    dto.items.forEach((item) => {
      if (item.quantity <= 0) {
        throw new BadRequestException('Quantity must be greater than zero');
      }
    });

    const ingredientIds = dto.items.map((item) => item.ingredientId);

    const ingredients = await this.prisma.ingredient.findMany({
      where: {
        id: {
          in: ingredientIds,
        },
        tenantId,
      },
    });

    if (ingredients.length !== ingredientIds.length) {
      throw new BadRequestException('Some ingredients not found');
    }

    return this.prisma.recipe.create({
      data: {
        tenantId,

        productId: dto.productId,

        RecipeItem: {
          create: dto.items.map((item) => ({
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
  }

  findByProduct(productId: string, tenantId: string) {
    return this.prisma.recipe.findFirst({
      where: {
        productId,
        tenantId,
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
  }
}
