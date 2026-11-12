import { BadRequestException } from '@nestjs/common';
import { BusinessType, ProductStockMode } from '@prisma/client';

import { ProductsRepository } from './products.repository';

describe('ProductsRepository.createFromDto', () => {
  const tenantFindUnique = jest.fn();
  const productFindFirst = jest.fn();
  const productCreate = jest.fn();
  const inventoryItemCreate = jest.fn();
  const inventoryStockCreate = jest.fn();
  const transaction = jest.fn();
  let repository: ProductsRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    tenantFindUnique.mockResolvedValue({ businessType: BusinessType.RETAIL });
    productFindFirst.mockResolvedValue(null);
    productCreate.mockResolvedValue({ id: 'product-a' });
    inventoryItemCreate.mockResolvedValue({ id: 'inventory-a' });
    transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      Promise.resolve(
        callback({
          tenant: { findUnique: tenantFindUnique },
          product: { findFirst: productFindFirst, create: productCreate },
          inventoryItem: { create: inventoryItemCreate },
          inventoryStock: { create: inventoryStockCreate },
        }),
      ),
    );
    repository = new ProductsRepository({ $transaction: transaction } as never);
  });

  it('defaults retail products to finished-goods inventory without opening stock', async () => {
    await repository.createFromDto({
      tenantId: 'tenant-a',
      name: 'Retail item',
      price: 250,
      sku: 'SKU-1',
    });

    expect(inventoryItemCreate).toHaveBeenCalledWith({
      data: {
        code: 'SKU-1',
        name: 'Retail item',
        description: undefined,
        type: 'PRODUCT',
        tenantId: 'tenant-a',
        unit: 'PCS',
      },
    });
    expect(productCreate).toHaveBeenCalledWith({
      data: {
        name: 'Retail item',
        description: undefined,
        sku: 'SKU-1',
        kitchenCategory: null,
        kitchenPrepTimeMinutes: null,
        price: 250,
        tenantId: 'tenant-a',
        stockMode: ProductStockMode.INVENTORY_ITEM,
        inventoryItemId: 'inventory-a',
      },
      include: {
        InventoryItem: { select: { id: true, isActive: true, unit: true } },
        Recipe: {
          select: {
            id: true,
            isActive: true,
            revision: true,
            _count: { select: { RecipeItem: true } },
          },
        },
      },
    });
    expect(inventoryStockCreate).not.toHaveBeenCalled();
  });

  it('defaults cafe products to recipe tracking without creating finished-goods inventory', async () => {
    tenantFindUnique.mockResolvedValueOnce({ businessType: BusinessType.CAFE });

    await repository.createFromDto({
      tenantId: 'tenant-a',
      name: 'Cafe menu',
      price: 250,
    });

    expect(inventoryItemCreate).not.toHaveBeenCalled();
    expect(productCreate).toHaveBeenCalledWith({
      data: {
        name: 'Cafe menu',
        description: undefined,
        sku: undefined,
        kitchenCategory: null,
        kitchenPrepTimeMinutes: null,
        price: 250,
        tenantId: 'tenant-a',
        stockMode: ProductStockMode.RECIPE,
        inventoryItemId: undefined,
      },
      include: {
        InventoryItem: { select: { id: true, isActive: true, unit: true } },
        Recipe: {
          select: {
            id: true,
            isActive: true,
            revision: true,
            _count: { select: { RecipeItem: true } },
          },
        },
      },
    });
  });

  it('rejects recipe stock mode for non-cafe tenants', async () => {
    await expect(
      repository.createFromDto({
        tenantId: 'tenant-a',
        name: 'Invalid menu',
        price: 250,
        stockMode: ProductStockMode.RECIPE,
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Recipe stock mode is only available for cafe tenants',
      ),
    );
    expect(productCreate).not.toHaveBeenCalled();
  });
});
