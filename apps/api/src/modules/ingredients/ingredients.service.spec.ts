import { BadRequestException } from '@nestjs/common';

import { IngredientsRepository } from './ingredients.repository';
import { IngredientsService } from './ingredients.service';

describe('IngredientsService', () => {
  const transaction = jest.fn();
  const createIngredient = jest.fn();
  const findAll = jest.fn();
  const findOne = jest.fn();
  const toIngredient = jest.fn((item: unknown) => item);
  const repository = {
    createIngredient,
    findAll,
    findOne,
    toIngredient,
  } as unknown as IngredientsRepository;
  const prisma = { $transaction: transaction };
  let service: IngredientsService;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      Promise.resolve(
        callback({
          inventoryItem: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
        }),
      ),
    );
    service = new IngredientsService(prisma as never, repository);
  });

  it('creates an ingredient as an inventory item in one transaction', async () => {
    createIngredient.mockResolvedValue({
      id: 'inventory-a',
      tenantId: 'tenant-a',
    });

    await expect(
      service.create('tenant-a', { name: 'Coffee beans', unit: 'kg' }),
    ).resolves.toEqual(expect.objectContaining({ tenantId: 'tenant-a' }));
    expect(createIngredient).toHaveBeenCalledWith(
      {
        tenantId: 'tenant-a',
        name: 'Coffee beans',
        unit: 'kg',
      },
      expect.any(Object),
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate ingredient names before persistence', async () => {
    const inventoryItemFindFirst = jest
      .fn()
      .mockResolvedValue({ id: 'existing' });
    transaction.mockImplementationOnce((callback: (tx: unknown) => unknown) =>
      Promise.resolve(
        callback({
          inventoryItem: { findFirst: inventoryItemFindFirst },
        }),
      ),
    );

    await expect(
      service.create('tenant-a', { name: 'Coffee beans', unit: 'kg' }),
    ).rejects.toThrow(new BadRequestException('Ingredient already exists'));
    expect(createIngredient).not.toHaveBeenCalled();
  });

  it('keeps reads tenant-scoped and preserves empty results', async () => {
    findAll.mockResolvedValue({ data: [], pagination: { total: 0 } });
    findOne.mockResolvedValue(null);

    const query = { page: 1, limit: 20 } as never;
    await expect(service.findAll('tenant-a', query)).resolves.toEqual({
      data: [],
      pagination: { total: 0 },
    });
    await expect(
      service.findOne('inventory-b', 'tenant-a'),
    ).resolves.toBeNull();
    expect(findAll).toHaveBeenCalledWith('tenant-a', query);
    expect(findOne).toHaveBeenCalledWith('inventory-b', 'tenant-a');
  });

  it('updates the inventory master record without duplicated ingredient data', async () => {
    const item = {
      id: 'inventory-a',
      tenantId: 'tenant-a',
      type: 'INGREDIENT',
      name: 'Coffee',
      unit: 'kg',
    };
    const inventoryItemFindFirst = jest
      .fn()
      .mockResolvedValueOnce(item)
      .mockResolvedValueOnce(null);
    const inventoryItemUpdate = jest.fn().mockResolvedValue({
      ...item,
      name: 'Arabica',
      isActive: false,
    });
    transaction.mockImplementationOnce(
      (callback: (tx: unknown) => unknown, options: unknown) =>
        Promise.resolve(
          callback({
            inventoryItem: {
              findFirst: inventoryItemFindFirst,
              update: inventoryItemUpdate,
            },
          }),
        ).then((result) => {
          expect(options).toEqual({
            isolationLevel: 'Serializable',
          });
          return result;
        }),
    );

    await service.update('inventory-a', 'tenant-a', {
      name: 'Arabica',
      isActive: false,
    });

    expect(inventoryItemUpdate).toHaveBeenCalledWith({
      where: { id: 'inventory-a' },
      data: { name: 'Arabica', isActive: false },
    });
    expect(toIngredient).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Arabica' }),
    );
  });

  it('blocks unit changes when stock or movement history exists', async () => {
    const item = {
      id: 'inventory-a',
      tenantId: 'tenant-a',
      type: 'INGREDIENT',
      name: 'Coffee',
      unit: 'kg',
    };
    const inventoryItemUpdate = jest.fn();
    transaction.mockImplementationOnce((callback: (tx: unknown) => unknown) =>
      Promise.resolve(
        callback({
          inventoryItem: {
            findFirst: jest.fn().mockResolvedValue(item),
            update: inventoryItemUpdate,
          },
          inventoryStock: {
            findFirst: jest.fn().mockResolvedValue({ id: 'stock-a' }),
          },
          inventoryMovement: { findFirst: jest.fn().mockResolvedValue(null) },
          recipeItem: { findFirst: jest.fn().mockResolvedValue(null) },
        }),
      ),
    );

    await expect(
      service.update('inventory-a', 'tenant-a', { unit: 'g' }),
    ).rejects.toThrow(
      new BadRequestException(
        'Ingredient unit cannot change after stock, movement, or recipe usage exists',
      ),
    );
    expect(inventoryItemUpdate).not.toHaveBeenCalled();
  });

  it('rejects empty updates', async () => {
    await expect(service.update('inventory-a', 'tenant-a', {})).rejects.toThrow(
      new BadRequestException('At least one ingredient field is required'),
    );
    expect(transaction).not.toHaveBeenCalled();
  });
});
