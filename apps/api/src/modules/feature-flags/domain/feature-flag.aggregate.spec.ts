import { FeatureFlagAggregate } from './feature-flag.aggregate';
import { testIds } from '../../../test/factories';

describe('FeatureFlagAggregate', () => {
  it('fails closed for a different tenant, even when the flag is enabled', () => {
    const flag = FeatureFlagAggregate.create(
      testIds.featureFlag,
      'inventory-v2',
      testIds.tenant,
      true,
    );

    expect(flag.evaluate({ tenantId: testIds.otherTenant })).toBe(false);
  });

  it('gives user overrides precedence over outlet overrides and default state', () => {
    const flag = FeatureFlagAggregate.create(
      testIds.featureFlag,
      'inventory-v2',
      testIds.tenant,
      false,
    );
    flag.addOverride({ outletId: testIds.outlet, enabled: false });
    flag.addOverride({ userId: testIds.user, enabled: true });

    expect(
      flag.evaluate({
        tenantId: testIds.tenant,
        outletId: testIds.outlet,
        userId: testIds.user,
      }),
    ).toBe(true);
  });

  it('evaluates targeting rules and fails closed when a required value is absent', () => {
    const flag = FeatureFlagAggregate.create(
      testIds.featureFlag,
      'inventory-v2',
      testIds.tenant,
      true,
    );
    flag.updateTargeting([
      { field: 'payload.plan', operator: 'eq', value: 'pro' },
    ]);

    expect(flag.evaluate({ tenantId: testIds.tenant }, { plan: 'pro' })).toBe(
      true,
    );
    expect(flag.evaluate({ tenantId: testIds.tenant }, { plan: 'free' })).toBe(
      false,
    );
    expect(flag.evaluate({ tenantId: testIds.tenant })).toBe(false);
  });

  it('enforces archive lifecycle invariants and restores deterministically', () => {
    const flag = FeatureFlagAggregate.create(
      testIds.featureFlag,
      'inventory-v2',
      testIds.tenant,
      true,
    );
    flag.archive();

    expect(flag.isDeleted()).toBe(true);
    expect(flag.evaluate({ tenantId: testIds.tenant })).toBe(false);
    expect(() => flag.enable()).toThrow(
      'Cannot enable an archived feature flag',
    );

    flag.restore();
    expect(flag.isDeleted()).toBe(false);
    expect(flag.evaluate({ tenantId: testIds.tenant })).toBe(true);
  });
});
