import { describe, expect, it } from "vitest";

import { recipeSchema } from "./recipe.schema";

describe("recipeSchema units", () => {
  it("allows explicit recipe units that differ from ingredient stock units", () => {
    const result = recipeSchema.safeParse({
      productId: "product-a",
      items: [
        {
          inventoryItemId: "ingredient-a",
          quantity: 0.25,
          unit: "kg",
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("converts an empty optional unit to the stock-unit default", () => {
    const result = recipeSchema.safeParse({
      productId: "product-a",
      items: [
        {
          inventoryItemId: "ingredient-a",
          quantity: 1,
          unit: "",
        },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items[0]?.unit).toBeUndefined();
    }
  });
});
