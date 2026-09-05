/**
 * Deterministic test data builders.  Callers may override every field so test
 * intent remains explicit and no test depends on random values or wall-clock
 * time.
 */
export const testIds = {
  tenant: 'tenant-a',
  otherTenant: 'tenant-b',
  outlet: 'outlet-a',
  user: 'user-a',
  product: 'product-a',
  order: 'order-a',
  inventory: 'inventory-a',
  subscription: 'subscription-a',
  invoice: 'invoice-a',
  business: 'business-a',
  role: 'role-a',
  featureFlag: 'feature-flag-a',
} as const;

export function tenantFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: testIds.tenant,
    name: 'Tenant A',
    deletedAt: null,
    ...overrides,
  };
}

export function outletFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: testIds.outlet,
    name: 'Outlet A',
    tenantId: testIds.tenant,
    deletedAt: null,
    ...overrides,
  };
}

export function userFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: testIds.user,
    email: 'user-a@example.test',
    password: 'hashed-password',
    tenantId: testIds.tenant,
    deletedAt: null,
    ...overrides,
  };
}

export function featureFlagFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: testIds.featureFlag,
    key: 'inventory-v2',
    tenantId: testIds.tenant,
    enabled: false,
    payload: null,
    deletedAt: null,
    ...overrides,
  };
}

export function productFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: testIds.product,
    name: 'Product A',
    sku: 'SKU-A',
    tenantId: testIds.tenant,
    deletedAt: null,
    ...overrides,
  };
}

export function orderFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: testIds.order,
    tenantId: testIds.tenant,
    outletId: testIds.outlet,
    status: 'PENDING',
    totalCents: 0,
    ...overrides,
  };
}

export function inventoryFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: testIds.inventory,
    tenantId: testIds.tenant,
    outletId: testIds.outlet,
    quantity: 10,
    reservedQuantity: 0,
    ...overrides,
  };
}

export function subscriptionFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: testIds.subscription,
    tenantId: testIds.tenant,
    status: 'ACTIVE',
    ...overrides,
  };
}

export function billingFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: testIds.invoice,
    tenantId: testIds.tenant,
    status: 'PENDING',
    amountCents: 0,
    ...overrides,
  };
}

export function businessRegistryFixture(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: testIds.business,
    tenantId: testIds.tenant,
    name: 'Business A',
    status: 'ACTIVE',
    deletedAt: null,
    ...overrides,
  };
}

export function superAdminActorFixture(
  overrides: Record<string, unknown> = {},
) {
  return {
    userId: testIds.user,
    tenantId: testIds.tenant,
    permissions: ['super_admin.read'],
    ...overrides,
  };
}

export function eventFixture(overrides: Record<string, unknown> = {}) {
  return {
    type: 'TEST_EVENT',
    payload: { tenantId: testIds.tenant },
    occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

export function requestUserFixture(overrides: Record<string, unknown> = {}) {
  return {
    userId: testIds.user,
    tenantId: testIds.tenant,
    outletId: testIds.outlet,
    ...overrides,
  };
}
