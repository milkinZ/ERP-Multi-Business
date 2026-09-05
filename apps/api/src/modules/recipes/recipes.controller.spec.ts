import { RecipesController } from './recipes.controller';
import { RecipesService } from './recipes.service';

describe('RecipesController', () => {
  const create = jest.fn();
  const findByProduct = jest.fn();
  const service = { create, findByProduct } as unknown as RecipesService;
  let controller: RecipesController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new RecipesController(service);
  });

  it('uses authenticated tenant context for recipe creation', async () => {
    create.mockResolvedValue({ id: 'recipe-a', tenantId: 'tenant-a' });
    const dto = {
      productId: 'product-a',
      items: [{ ingredientId: 'ingredient-a', quantity: 2 }],
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
});
