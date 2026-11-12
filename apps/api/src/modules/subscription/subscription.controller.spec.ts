import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { PlanEntitlementsService } from './plans/plan-entitlements.service';

describe('SubscriptionController', () => {
  it('returns feature entitlements before the dynamic subscription id route', async () => {
    const getForTenant = jest.fn().mockResolvedValue({
      featureModuleKeys: ['INVENTORY', 'PROCUREMENT', 'ANALYTICS'],
    });
    const controller = new SubscriptionController(
      {} as SubscriptionService,
      { getForTenant } as unknown as PlanEntitlementsService,
    );

    await expect(
      controller.getFeatureEntitlements({
        tenantId: 'tenant-a',
      } as never),
    ).resolves.toEqual({
      featureModules: ['INVENTORY', 'PROCUREMENT', 'ANALYTICS'],
    });
    expect(getForTenant).toHaveBeenCalledWith('tenant-a');

    const routeNames = Object.getOwnPropertyNames(
      SubscriptionController.prototype,
    );
    expect(routeNames.indexOf('getFeatureEntitlements')).toBeLessThan(
      routeNames.indexOf('getById'),
    );
  });
});
