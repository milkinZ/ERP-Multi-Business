import { RecipesRepository } from './recipes.repository';
import { RecipesService } from './recipes.service';

describe('RecipesService', () => {
  const createRecipe = jest.fn();
  const findByProduct = jest.fn();
  const findAll = jest.fn();
  const findByInventoryItem = jest.fn();
  const repository = {
    createRecipe,
    findByProduct,
    findAll,
    findByInventoryItem,
  } as unknown as RecipesRepository;
  let service: RecipesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RecipesService(repository);
  });

  it('creates a recipe with tenant, product, and inventory item quantities', async () => {
    createRecipe.mockResolvedValue({ id: 'recipe-a', tenantId: 'tenant-a' });
    const items = [
      { inventoryItemId: 'inventory-a', quantity: 2 },
      { inventoryItemId: 'inventory-b', quantity: 1 },
    ];

    await expect(
      service.create('tenant-a', { productId: 'product-a', items }),
    ).resolves.toEqual(expect.objectContaining({ tenantId: 'tenant-a' }));
    expect(createRecipe).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      productId: 'product-a',
      items,
    });
  });

  it('rejects invalid recipe invariants before persistence', async () => {
    await expect(
      service.create('tenant-a', { productId: 'product-a', items: [] }),
    ).rejects.toThrow('Recipe must contain at least one inventory item');
    await expect(
      service.create('tenant-a', {
        productId: 'product-a',
        items: [
          { inventoryItemId: 'inventory-a', quantity: 1 },
          { inventoryItemId: 'inventory-a', quantity: 1 },
        ],
      }),
    ).rejects.toThrow('Duplicate inventory items detected');
    expect(createRecipe).not.toHaveBeenCalled();
  });

  it('finds recipes through a tenant-scoped product lookup', async () => {
    findByProduct.mockResolvedValue(null);

    await expect(
      service.findByProduct('product-b', 'tenant-a'),
    ).resolves.toBeNull();
    expect(findByProduct).toHaveBeenCalledWith('product-b', 'tenant-a');
  });

  it('delegates recipe catalog queries with tenant scope', async () => {
    const query = { page: 1, limit: 20 };
    findAll.mockResolvedValue({ data: [], pagination: { total: 0 } });

    await expect(service.findAll('tenant-a', query)).resolves.toEqual({
      data: [],
      pagination: { total: 0 },
    });
    expect(findAll).toHaveBeenCalledWith('tenant-a', query);
  });

  it('delegates inventory item recipe usage with tenant scope', async () => {
    const query = { page: 1, limit: 20 };
    findByInventoryItem.mockResolvedValue({
      data: [],
      pagination: { total: 0 },
    });

    await expect(
      service.findByInventoryItem('inventory-a', 'tenant-a', query),
    ).resolves.toEqual({ data: [], pagination: { total: 0 } });
    expect(findByInventoryItem).toHaveBeenCalledWith(
      'inventory-a',
      'tenant-a',
      query,
    );
  });
});
