import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InventoryItemType } from '@prisma/client';

import { RecipesRepository } from './recipes.repository';

describe('RecipesRepository.findAll', () => {
  const findMany = jest.fn();
  const count = jest.fn();
  const transaction = jest.fn();
  const productFindFirst = jest.fn();
  const inventoryItemFindFirst = jest.fn();
  const inventoryItemFindMany = jest.fn();
  const recipeCreate = jest.fn();
  const recipeItemFindMany = jest.fn();
  const recipeItemCount = jest.fn();
  let repository: RecipesRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    findMany.mockResolvedValue(recipes);
    count.mockResolvedValue(11);
    productFindFirst.mockResolvedValue({ id: 'product-a' });
    inventoryItemFindFirst.mockResolvedValue({ id: 'inventory-a' });
    inventoryItemFindMany.mockResolvedValue([{ id: 'inventory-a' }]);
    recipeCreate.mockResolvedValue({ id: 'recipe-created' });
    recipeItemFindMany.mockResolvedValue(usage);
    recipeItemCount.mockResolvedValue(1);
    transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      Promise.resolve(
        callback({
          product: { findFirst: productFindFirst },
          inventoryItem: { findMany: inventoryItemFindMany },
          recipe: { create: recipeCreate },
        }),
      ),
    );
    repository = new RecipesRepository({
      $transaction: transaction,
      recipe: { findMany, count, create: recipeCreate },
      product: { findFirst: productFindFirst },
      inventoryItem: {
        findFirst: inventoryItemFindFirst,
        findMany: inventoryItemFindMany,
      },
      recipeItem: { findMany: recipeItemFindMany, count: recipeItemCount },
    } as never);
  });

  const recipes = [
    {
      id: 'recipe-a',
      tenantId: 'tenant-a',
      productId: 'product-a',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      Product: {
        id: 'product-a',
        name: 'Coffee',
        sku: 'COF-1',
        isActive: true,
      },
      _count: { RecipeItem: 2 },
    },
  ];
  const usage = [
    {
      id: 'recipe-item-a',
      recipeId: 'recipe-a',
      inventoryItemId: 'inventory-a',
      quantity: 2.5,
      Recipe: {
        id: 'recipe-a',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        Product: { id: 'product-a', name: 'Coffee', sku: 'COF-1' },
      },
    },
  ];

  it('persists recipe lines directly against active ingredient inventory items', async () => {
    await expect(
      repository.createRecipe({
        tenantId: 'tenant-a',
        productId: 'product-a',
        items: [{ inventoryItemId: 'inventory-a', quantity: 2 }],
      }),
    ).resolves.toEqual({ id: 'recipe-created' });

    expect(inventoryItemFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['inventory-a'] },
        tenantId: 'tenant-a',
        type: InventoryItemType.INGREDIENT,
        isActive: true,
      },
    });
    expect(recipeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          tenantId: 'tenant-a',
          productId: 'product-a',
          RecipeItem: {
            create: [{ inventoryItemId: 'inventory-a', quantity: 2 }],
          },
        },
      }),
    );
  });

  it('rejects inventory items that are missing, inactive, or not ingredients', async () => {
    inventoryItemFindMany.mockResolvedValueOnce([]);

    await expect(
      repository.createRecipe({
        tenantId: 'tenant-a',
        productId: 'product-a',
        items: [{ inventoryItemId: 'inventory-a', quantity: 2 }],
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Inventory item not found, inactive, or not an ingredient',
      ),
    );
    expect(recipeCreate).not.toHaveBeenCalled();
  });

  it('returns a tenant-scoped, searchable and bounded recipe catalog', async () => {
    const result = await repository.findAll('tenant-a', {
      page: 2,
      limit: 5,
      search: ' coffee ',
    });
    const where = {
      tenantId: 'tenant-a',
      Product: {
        is: {
          tenantId: 'tenant-a',
          OR: [
            { name: { contains: 'coffee', mode: 'insensitive' } },
            { sku: { contains: 'coffee', mode: 'insensitive' } },
          ],
        },
      },
    };

    expect(findMany).toHaveBeenCalledWith({
      where,
      select: {
        id: true,
        tenantId: true,
        productId: true,
        createdAt: true,
        Product: {
          select: { id: true, name: true, sku: true, isActive: true },
        },
        _count: { select: { RecipeItem: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: 5,
      take: 5,
    });
    expect(count).toHaveBeenCalledWith({ where });
    expect(result).toEqual({
      data: recipes,
      pagination: { page: 2, limit: 5, total: 11, totalPages: 3 },
    });
  });

  it('lists tenant recipes with default pagination when no filters are passed', async () => {
    await repository.findAll('tenant-a', {});

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          Product: { is: { tenantId: 'tenant-a' } },
        },
        skip: 0,
        take: 20,
      }),
    );
  });

  it('returns tenant-scoped recipe usage for an inventory item', async () => {
    const result = await repository.findByInventoryItem(
      'inventory-a',
      'tenant-a',
      { page: 1, limit: 20 },
    );
    const where = {
      inventoryItemId: 'inventory-a',
      InventoryItem: { is: { tenantId: 'tenant-a', type: 'INGREDIENT' } },
      Recipe: {
        is: {
          tenantId: 'tenant-a',
          Product: { is: { tenantId: 'tenant-a' } },
        },
      },
    };

    expect(inventoryItemFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'inventory-a',
        tenantId: 'tenant-a',
        type: 'INGREDIENT',
      },
      select: { id: true },
    });
    expect(recipeItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, skip: 0, take: 20 }),
    );
    expect(recipeItemCount).toHaveBeenCalledWith({ where });
    expect(result).toEqual({
      data: usage,
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it('filters tenant-scoped inventory item recipe usage by product name or SKU', async () => {
    await repository.findByInventoryItem('inventory-a', 'tenant-a', {
      page: 1,
      limit: 20,
      search: ' coffee ',
    });

    expect(recipeItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          inventoryItemId: 'inventory-a',
          InventoryItem: {
            is: { tenantId: 'tenant-a', type: 'INGREDIENT' },
          },
          Recipe: {
            is: {
              tenantId: 'tenant-a',
              Product: {
                is: {
                  tenantId: 'tenant-a',
                  OR: [
                    { name: { contains: 'coffee', mode: 'insensitive' } },
                    { sku: { contains: 'coffee', mode: 'insensitive' } },
                  ],
                },
              },
            },
          },
        },
      }),
    );
  });

  it('rejects inventory item usage lookup outside the tenant', async () => {
    inventoryItemFindFirst.mockResolvedValueOnce(null);

    await expect(
      repository.findByInventoryItem('inventory-foreign', 'tenant-a', {}),
    ).rejects.toThrow(
      new NotFoundException('Ingredient inventory item not found'),
    );
    expect(recipeItemFindMany).not.toHaveBeenCalled();
  });
});
