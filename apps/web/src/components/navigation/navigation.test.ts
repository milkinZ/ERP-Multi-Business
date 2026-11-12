import { describe, expect, it } from "vitest";

import { navigationFor } from "./navigation";

describe("navigationFor", () => {
  it("only includes modular ERP menus with an active purchased entitlement", () => {
    const navigation = navigationFor("erp", ["INVENTORY", "ANALYTICS"]).map(
      (item) => item.label,
    );

    expect(navigation).toContain("Inventory");
    expect(navigation).toContain("Ingredients");
    expect(navigation).toContain("Recipes");
    expect(navigation).toContain("Warehouses");
    expect(navigation).not.toContain("Suppliers");
    expect(navigation).not.toContain("Purchase orders");
    expect(navigation).not.toContain("Finance");
  });

  it("keeps core ERP menus available without optional module entitlements", () => {
    const navigation = navigationFor("erp", []).map((item) => item.label);

    expect(navigation).toContain("Dashboard");
    expect(navigation).toContain("Products");
    expect(navigation).toContain("Orders");
    expect(navigation).toContain("Payments");
    expect(navigation).not.toContain("Inventory");
    expect(navigation).not.toContain("Suppliers");
  });

  it("does not apply tenant module filtering to the platform console", () => {
    const navigation = navigationFor("platform", []).map((item) => item.label);

    expect(navigation).toContain("Plans & modules");
    expect(navigation).toContain("Tenants");
  });
});
