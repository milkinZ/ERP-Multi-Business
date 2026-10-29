import { RecipeAggregate } from './recipe.aggregate';

describe('RecipeAggregate', () => {
  const base = {
    id: 'recipe-a',
    tenantId: 'tenant-a',
    productId: 'product-a',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  it('accepts positive unique inventory item quantities', () => {
    const aggregate = RecipeAggregate.create({
      ...base,
      items: [{ inventoryItemId: 'inventory-a', quantity: 2 }],
    });

    expect(aggregate.tenantId).toBe('tenant-a');
    expect(aggregate.items).toEqual([
      { inventoryItemId: 'inventory-a', quantity: 2 },
    ]);
  });

  it('rejects missing product, empty items, duplicate items, and invalid quantities', () => {
    expect(() =>
      RecipeAggregate.create({
        ...base,
        productId: ' ',
        items: [{ inventoryItemId: 'a', quantity: 1 }],
      }),
    ).toThrow('Recipe product id must not be empty');
    expect(() => RecipeAggregate.create({ ...base, items: [] })).toThrow(
      'Recipe must contain at least one inventory item',
    );
    expect(() =>
      RecipeAggregate.create({
        ...base,
        items: [
          { inventoryItemId: 'a', quantity: 1 },
          { inventoryItemId: 'a', quantity: 2 },
        ],
      }),
    ).toThrow('Duplicate inventory items detected');
    expect(() =>
      RecipeAggregate.create({
        ...base,
        items: [{ inventoryItemId: 'a', quantity: 0 }],
      }),
    ).toThrow('Inventory item quantity must be a positive integer');
  });
});
