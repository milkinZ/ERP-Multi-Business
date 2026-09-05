import { RecipesRepository } from './recipes.repository';
import { RecipesService } from './recipes.service';

describe('RecipesService', () => {
  const createRecipe = jest.fn();
  const findByProduct = jest.fn();
  const repository = {
    createRecipe,
    findByProduct,
  } as unknown as RecipesRepository;
  let service: RecipesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RecipesService(repository);
  });

  it('creates a recipe with tenant, product, and ingredient quantities', async () => {
    createRecipe.mockResolvedValue({ id: 'recipe-a', tenantId: 'tenant-a' });
    const items = [
      { ingredientId: 'ingredient-a', quantity: 2 },
      { ingredientId: 'ingredient-b', quantity: 1 },
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
    ).rejects.toThrow('Recipe must contain at least one ingredient');
    await expect(
      service.create('tenant-a', {
        productId: 'product-a',
        items: [
          { ingredientId: 'ingredient-a', quantity: 1 },
          { ingredientId: 'ingredient-a', quantity: 1 },
        ],
      }),
    ).rejects.toThrow('Duplicate ingredients detected');
    expect(createRecipe).not.toHaveBeenCalled();
  });

  it('finds recipes through a tenant-scoped product lookup', async () => {
    findByProduct.mockResolvedValue(null);

    await expect(
      service.findByProduct('product-b', 'tenant-a'),
    ).resolves.toBeNull();
    expect(findByProduct).toHaveBeenCalledWith('product-b', 'tenant-a');
  });
});
