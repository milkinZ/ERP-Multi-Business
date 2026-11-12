import { describe, expect, it } from "vitest";

import { productSchema } from "./product.schema";

const productInput = {
  name: "Menu item",
  price: 250,
};

describe("productSchema stock policy", () => {
  it("requires a stock unit for inventory-tracked products", () => {
    const result = productSchema.safeParse({
      ...productInput,
      stockMode: "INVENTORY_ITEM",
      inventoryUnit: "",
    });

    expect(result.success).toBe(false);
  });

  it("allows recipe-based cafe products without a finished-goods unit", () => {
    const result = productSchema.safeParse({
      ...productInput,
      stockMode: "RECIPE",
    });

    expect(result.success).toBe(true);
  });

  it("allows explicitly untracked products", () => {
    const result = productSchema.safeParse({
      ...productInput,
      stockMode: "UNTRACKED",
    });

    expect(result.success).toBe(true);
  });
});
