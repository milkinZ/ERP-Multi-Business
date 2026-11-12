import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BusinessType,
  InventoryItemType,
  ProductStockMode,
} from '@prisma/client';
import { Prisma } from '@prisma/client';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';
import { RecipeAggregate } from './domain/recipe.aggregate';
import { ListRecipesQueryDto } from './dto/list-recipes-query.dto';
import { resolveUnitConversionFactor } from '../ingredients/unit-conversion';

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
    userId: string;
    productId: string;
    items: { inventoryItemId: string; quantity: number; unit?: string }[];
  }) {
    const aggregate = RecipeAggregate.create({
      id: `RC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      tenantId: data.tenantId,
      productId: data.productId,
      items: data.items,
      createdAt: new Date(),
    });

    const persisted = await this.prisma.$transaction(async (tx) => {
      await this.assertCafeTenant(tx, aggregate.tenantId);
      const [lockedProduct] = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Product"
        WHERE "id" = ${aggregate.productId}
          AND "tenantId" = ${aggregate.tenantId}
          AND "isActive" = true
        FOR UPDATE
      `;
      if (!lockedProduct) throw new BadRequestException('Product not found');

      const product = await tx.product.findFirst({
        where: {
          id: aggregate.productId,
          tenantId: aggregate.tenantId,
          isActive: true,
        },
      });
      if (!product) throw new BadRequestException('Product not found');

      const recipeItems = await this.validateRecipeItems(
        tx,
        aggregate.tenantId,
        aggregate.items,
      );
      await tx.product.update({
        where: { id: aggregate.productId },
        data: { stockMode: ProductStockMode.RECIPE },
      });

      const recipe = await tx.recipe.create({
        data: {
          tenantId: aggregate.tenantId,
          productId: aggregate.productId,
          RecipeItem: {
            create: recipeItems,
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
      await tx.auditLog.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId,
          entity: 'Recipe',
          entityId: recipe.id,
          action: 'RECIPE_CREATED',
          metadata: {
            productId: recipe.productId,
            revision: recipe.revision,
            ingredientCount: aggregate.items.length,
          },
        },
      });
      return recipe;
    });

    return persisted;
  }

  async updateRecipe(data: {
    tenantId: string;
    userId: string;
    productId: string;
    expectedRevision: number;
    items: { inventoryItemId: string; quantity: number; unit?: string }[];
  }) {
    const aggregate = RecipeAggregate.create({
      id: `RC-${Date.now()}`,
      tenantId: data.tenantId,
      productId: data.productId,
      items: data.items,
      createdAt: new Date(),
    });

    return this.prisma.$transaction(
      async (tx) => {
        await this.assertCafeTenant(tx, data.tenantId);
        const [recipe] = await tx.$queryRaw<
          Array<{ id: string; revision: number; isActive: boolean }>
        >`
          SELECT "id", "revision", "isActive"
          FROM "Recipe"
          WHERE "productId" = ${data.productId}
            AND "tenantId" = ${data.tenantId}
          FOR UPDATE
        `;
        if (!recipe) throw new NotFoundException('Recipe not found');
        if (!recipe.isActive) {
          throw new ConflictException(
            'Archived recipes must be restored first',
          );
        }
        if (recipe.revision !== data.expectedRevision) {
          throw new ConflictException(
            'Recipe changed since it was loaded; reload before saving',
          );
        }

        const product = await tx.product.findFirst({
          where: {
            id: data.productId,
            tenantId: data.tenantId,
            isActive: true,
          },
          select: { id: true },
        });
        if (!product) throw new BadRequestException('Product not found');

        const recipeItems = await this.validateRecipeItems(
          tx,
          data.tenantId,
          aggregate.items,
        );

        await tx.recipe.update({
          where: { id: recipe.id },
          data: { revision: { increment: 1 } },
        });
        await tx.recipeItem.deleteMany({ where: { recipeId: recipe.id } });
        await tx.recipeItem.createMany({
          data: recipeItems.map((item) => ({
            ...item,
            recipeId: recipe.id,
          })),
        });
        await tx.auditLog.create({
          data: {
            tenantId: data.tenantId,
            userId: data.userId,
            entity: 'Recipe',
            entityId: recipe.id,
            action: 'RECIPE_UPDATED',
            metadata: {
              productId: data.productId,
              previousRevision: recipe.revision,
              revision: recipe.revision + 1,
              ingredientCount: aggregate.items.length,
            },
          },
        });
        return tx.recipe.findFirstOrThrow({
          where: { id: recipe.id, tenantId: data.tenantId },
          include: {
            Product: true,
            RecipeItem: { include: { InventoryItem: true } },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async archiveRecipe(productId: string, tenantId: string, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.assertCafeTenant(tx, tenantId);
      const [recipe] = await tx.$queryRaw<
        Array<{ id: string; revision: number; isActive: boolean }>
      >`
        SELECT "id", "revision", "isActive"
        FROM "Recipe"
        WHERE "productId" = ${productId}
          AND "tenantId" = ${tenantId}
        FOR UPDATE
      `;
      if (!recipe) throw new NotFoundException('Recipe not found');
      if (!recipe.isActive) throw new ConflictException('Recipe is archived');
      await tx.recipe.update({
        where: { id: recipe.id },
        data: {
          isActive: false,
          archivedAt: new Date(),
          revision: { increment: 1 },
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          entity: 'Recipe',
          entityId: recipe.id,
          action: 'RECIPE_ARCHIVED',
          metadata: { productId, previousRevision: recipe.revision },
        },
      });
    });
    return this.findByProduct(productId, tenantId);
  }

  async restoreRecipe(productId: string, tenantId: string, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.assertCafeTenant(tx, tenantId);
      const [recipe] = await tx.$queryRaw<
        Array<{ id: string; revision: number; isActive: boolean }>
      >`
        SELECT "id", "revision", "isActive"
        FROM "Recipe"
        WHERE "productId" = ${productId}
          AND "tenantId" = ${tenantId}
        FOR UPDATE
      `;
      if (!recipe) throw new NotFoundException('Recipe not found');
      if (recipe.isActive) throw new ConflictException('Recipe is active');
      await tx.recipe.update({
        where: { id: recipe.id },
        data: {
          isActive: true,
          archivedAt: null,
          revision: { increment: 1 },
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          entity: 'Recipe',
          entityId: recipe.id,
          action: 'RECIPE_RESTORED',
          metadata: { productId, previousRevision: recipe.revision },
        },
      });
    });
    return this.findByProduct(productId, tenantId);
  }

  async findByProduct(productId: string, tenantId: string) {
    await this.assertCafeTenant(this.prisma, tenantId);
    return this.prisma.recipe.findFirst({
      where: { productId, tenantId, Product: { is: { tenantId } } },
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
    await this.assertCafeTenant(this.prisma, tenantId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();
    const where: Prisma.RecipeWhereInput = {
      tenantId,
      ...(query.includeArchived ? {} : { isActive: true }),
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
          updatedAt: true,
          revision: true,
          isActive: true,
          archivedAt: true,
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
    await this.assertCafeTenant(this.prisma, tenantId);
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
          isActive: true,
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

  private async assertCafeTenant(
    client: PrismaService | Prisma.TransactionClient,
    tenantId: string,
  ) {
    const tenant = await client.tenant.findUnique({
      where: { id: tenantId },
      select: { businessType: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (tenant.businessType !== BusinessType.CAFE) {
      throw new ForbiddenException(
        'Recipes are available to CAFE tenants only',
      );
    }
  }

  private async validateRecipeItems(
    tx: Prisma.TransactionClient,
    tenantId: string,
    items: { inventoryItemId: string; quantity: number; unit?: string }[],
  ) {
    const inventoryItems = await tx.inventoryItem.findMany({
      where: {
        id: { in: items.map((item) => item.inventoryItemId) },
        tenantId,
        type: InventoryItemType.INGREDIENT,
        isActive: true,
      },
      select: { id: true, unit: true },
    });
    if (inventoryItems.length !== items.length) {
      throw new BadRequestException(
        'Recipe ingredients must be active ingredients owned by this tenant',
      );
    }

    const tenantRules = await tx.tenantUnitConversion.findMany({
      where: { tenantId },
      select: { fromUnit: true, toUnit: true, factor: true },
    });
    const itemRules = await tx.inventoryUnitConversion.findMany({
      where: {
        tenantId,
        inventoryItemId: { in: items.map((item) => item.inventoryItemId) },
      },
      select: {
        inventoryItemId: true,
        fromUnit: true,
        toUnit: true,
        factor: true,
      },
    });

    return items.map((item) => {
      const inventoryItem = inventoryItems.find(
        (candidate) => candidate.id === item.inventoryItemId,
      );
      if (!inventoryItem?.unit?.trim()) {
        throw new BadRequestException(
          `Ingredient ${item.inventoryItemId} must have a stock unit configured`,
        );
      }

      const unit = item.unit?.trim() || inventoryItem.unit.trim();
      const conversions = [
        ...tenantRules,
        ...itemRules.filter(
          (rule) => rule.inventoryItemId === item.inventoryItemId,
        ),
      ];
      const factor = resolveUnitConversionFactor(
        unit,
        inventoryItem.unit,
        conversions,
      );
      if (!factor) {
        throw new BadRequestException(
          `No valid unit conversion from ${unit} to ${inventoryItem.unit} for ingredient ${inventoryItem.id}`,
        );
      }

      return {
        inventoryItemId: item.inventoryItemId,
        quantity: item.quantity,
        unit,
      };
    });
  }
}
