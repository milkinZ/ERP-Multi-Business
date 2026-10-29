import { InventoryItemType, Prisma } from '@prisma/client';

import { IngredientsRepository } from './ingredients.repository';

describe('IngredientsRepository list contract', () => {
  const findMany = jest.fn<
    Promise<
      Array<Prisma.InventoryItemGetPayload<Prisma.InventoryItemDefaultArgs>>
    >,
    [Prisma.InventoryItemFindManyArgs]
  >();
  const count = jest.fn<Promise<number>, [Prisma.InventoryItemCountArgs]>();
  const prisma = {
    inventoryItem: { findMany, count },
  } as never;
  let repository: IngredientsRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    const item: Prisma.InventoryItemGetPayload<Prisma.InventoryItemDefaultArgs> =
      {
        id: 'inventory-a',
        code: 'ING-COFFEE',
        name: 'Coffee',
        description: null,
        unit: 'kg',
        type: InventoryItemType.INGREDIENT,
        isActive: true,
        valuationMethod: null,
        movingAverageScope: null,
        standardCost: null,
        averageUnitCost: null,
        valuationLockedAt: null,
        tenantId: 'tenant-a',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      };
    findMany.mockResolvedValue([item]);
    count.mockResolvedValue(1);
    repository = new IngredientsRepository(prisma);
  });

  it('lists ingredient inventory items by status and search', async () => {
    const item: Prisma.InventoryItemGetPayload<Prisma.InventoryItemDefaultArgs> =
      {
        id: 'inventory-a',
        code: 'ING-COFFEE',
        name: 'Coffee',
        description: null,
        unit: 'kg',
        type: InventoryItemType.INGREDIENT,
        isActive: true,
        valuationMethod: null,
        movingAverageScope: null,
        standardCost: null,
        averageUnitCost: null,
        valuationLockedAt: null,
        tenantId: 'tenant-a',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      };
    await expect(
      repository.findAll('tenant-a', {
        page: 1,
        limit: 10,
        search: 'coffee',
        isActive: true,
      }),
    ).resolves.toEqual({
      data: [
        {
          id: item.id,
          name: item.name,
          unit: item.unit,
          tenantId: item.tenantId,
          inventoryItemId: item.id,
          createdAt: item.createdAt,
          InventoryItem: item,
        },
      ],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    const findManyArgs = findMany.mock.calls[0]?.[0];
    const countArgs = count.mock.calls[0]?.[0];
    expect(findManyArgs).toMatchObject({
      where: {
        tenantId: 'tenant-a',
        type: InventoryItemType.INGREDIENT,
        isActive: true,
        OR: [
          { name: { contains: 'coffee', mode: 'insensitive' } },
          { unit: { contains: 'coffee', mode: 'insensitive' } },
          { code: { contains: 'coffee', mode: 'insensitive' } },
        ],
      },
      skip: 0,
      take: 10,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(countArgs?.where).toEqual(findManyArgs?.where);
  });
});
