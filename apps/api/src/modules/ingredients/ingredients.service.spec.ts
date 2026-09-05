import { BadRequestException } from '@nestjs/common';

import { IngredientsRepository } from './ingredients.repository';
import { IngredientsService } from './ingredients.service';

describe('IngredientsService', () => {
  const transaction = jest.fn();
  const createIngredient = jest.fn();
  const findAll = jest.fn();
  const findOne = jest.fn();
  const repository = {
    createIngredient,
    findAll,
    findOne,
  } as unknown as IngredientsRepository;
  const prisma = { $transaction: transaction };
  let service: IngredientsService;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      Promise.resolve(
        callback({
          inventoryItem: {
            create: jest.fn().mockResolvedValue({ id: 'inventory-a' }),
          },
          ingredient: { findFirst: jest.fn().mockResolvedValue(null) },
        }),
      ),
    );
    service = new IngredientsService(prisma as never, repository);
  });

  it('creates an inventory item and linked ingredient in one transaction', async () => {
    createIngredient.mockResolvedValue({
      id: 'ingredient-a',
      tenantId: 'tenant-a',
    });

    await expect(
      service.create('tenant-a', { name: 'Coffee beans', unit: 'kg' }),
    ).resolves.toEqual(expect.objectContaining({ tenantId: 'tenant-a' }));
    expect(createIngredient).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      name: 'Coffee beans',
      unit: 'kg',
      inventoryItemId: 'inventory-a',
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate ingredient names before repository persistence', async () => {
    const inventoryCreate = jest.fn().mockResolvedValue({ id: 'inventory-a' });
    const ingredientFindFirst = jest.fn().mockResolvedValue({ id: 'existing' });
    transaction.mockImplementationOnce((callback: (tx: unknown) => unknown) =>
      Promise.resolve(
        callback({
          inventoryItem: { create: inventoryCreate },
          ingredient: { findFirst: ingredientFindFirst },
        }),
      ),
    );

    await expect(
      service.create('tenant-a', { name: 'Coffee beans', unit: 'kg' }),
    ).rejects.toThrow(new BadRequestException('Ingredient already exists'));
    expect(createIngredient).not.toHaveBeenCalled();
  });

  it('keeps reads tenant-scoped and preserves empty results', async () => {
    findAll.mockResolvedValue([]);
    findOne.mockResolvedValue(null);

    await expect(service.findAll('tenant-a')).resolves.toEqual([]);
    await expect(
      service.findOne('ingredient-b', 'tenant-a'),
    ).resolves.toBeNull();
    expect(findAll).toHaveBeenCalledWith('tenant-a');
    expect(findOne).toHaveBeenCalledWith('ingredient-b', 'tenant-a');
  });
});
