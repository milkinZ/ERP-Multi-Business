import { RecipeAggregate } from './recipe.aggregate';

describe('RecipeAggregate', () => {
  const base = {
    id: 'recipe-a',
    tenantId: 'tenant-a',
    productId: 'product-a',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  it('accepts positive unique ingredient quantities', () => {
    const aggregate = RecipeAggregate.create({
      ...base,
      items: [{ ingredientId: 'ingredient-a', quantity: 2 }],
    });

    expect(aggregate.tenantId).toBe('tenant-a');
    expect(aggregate.items).toEqual([
      { ingredientId: 'ingredient-a', quantity: 2 },
    ]);
  });

  it('rejects missing product, empty items, duplicate ingredients, and invalid quantities', () => {
    expect(() =>
      RecipeAggregate.create({
        ...base,
        productId: ' ',
        items: [{ ingredientId: 'a', quantity: 1 }],
      }),
    ).toThrow('Recipe product id must not be empty');
    expect(() => RecipeAggregate.create({ ...base, items: [] })).toThrow(
      'Recipe must contain at least one ingredient',
    );
    expect(() =>
      RecipeAggregate.create({
        ...base,
        items: [
          { ingredientId: 'a', quantity: 1 },
          { ingredientId: 'a', quantity: 2 },
        ],
      }),
    ).toThrow('Duplicate ingredients detected');
    expect(() =>
      RecipeAggregate.create({
        ...base,
        items: [{ ingredientId: 'a', quantity: 0 }],
      }),
    ).toThrow('Ingredient quantity must be a positive integer');
  });
});
