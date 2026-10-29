import { RecipesController } from './recipes.controller';
import { RecipesService } from './recipes.service';

describe('RecipesController', () => {
  const create = jest.fn();
  const findByProduct = jest.fn();
  const findAll = jest.fn();
  const findByInventoryItem = jest.fn();
  const service = {
    create,
    findByProduct,
    findAll,
    findByInventoryItem,
  } as unknown as RecipesService;
  let controller: RecipesController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new RecipesController(service);
  });

  it('uses authenticated tenant context for recipe creation', async () => {
    create.mockResolvedValue({ id: 'recipe-a', tenantId: 'tenant-a' });
    const dto = {
      productId: 'product-a',
      items: [{ inventoryItemId: 'inventory-a', quantity: 2 }],
    } as never;

    await controller.create(dto, { tenantId: 'tenant-a' } as never);

    expect(create).toHaveBeenCalledWith('tenant-a', dto);
  });

  it('keeps product recipe lookup tenant-scoped', async () => {
    findByProduct.mockResolvedValue(null);

    await controller.findByProduct('product-b', {
      tenantId: 'tenant-a',
    } as never);

    expect(findByProduct).toHaveBeenCalledWith('product-b', 'tenant-a');
  });

  it('uses authenticated tenant context for recipe catalog queries', async () => {
    const query = { page: 2, limit: 10, search: 'coffee' } as never;
    findAll.mockResolvedValue({ data: [], pagination: { total: 0 } });

    await controller.findAll(query, { tenantId: 'tenant-a' } as never);

    expect(findAll).toHaveBeenCalledWith('tenant-a', query);
  });

  it('uses authenticated tenant context for inventory item recipe usage', async () => {
    const query = { page: 1, limit: 20 } as never;

    await controller.findByInventoryItem('inventory-a', query, {
      tenantId: 'tenant-a',
    } as never);

    expect(findByInventoryItem).toHaveBeenCalledWith(
      'inventory-a',
      'tenant-a',
      query,
    );
  });
});
