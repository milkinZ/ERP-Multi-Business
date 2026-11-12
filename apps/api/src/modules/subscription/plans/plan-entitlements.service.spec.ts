import { ConflictException } from '@nestjs/common';
import { PlanType } from '../domain/subscription.aggregate';
import { PlanEntitlementsService } from './plan-entitlements.service';

describe('PlanEntitlementsService', () => {
  const findSubscription = jest.fn();
  const findFeatureModule = jest.fn();
  const outletCount = jest.fn();
  const userCount = jest.fn();
  const invitationCount = jest.fn();
  const service = new PlanEntitlementsService({
    subscription: { findFirst: findSubscription },
    featureModule: { findUnique: findFeatureModule },
    outlet: { count: outletCount },
    user: { count: userCount },
    userInvitation: { count: invitationCount },
  } as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the approved Free limits for tenants without an explicit plan', async () => {
    findSubscription.mockResolvedValue(null);

    await expect(service.getForTenant('tenant-a')).resolves.toEqual({
      planType: PlanType.FREE,
      maxOutlets: 1,
      maxUsers: 3,
      maxMonthlyOrders: 500,
      featureModuleKeys: [],
    });
  });

  it('uses persisted Enterprise values, including unlimited quotas', async () => {
    findSubscription.mockResolvedValue({
      plan: {
        type: PlanType.ENTERPRISE,
        maxOutlets: null,
        maxUsers: null,
        maxMonthlyOrders: null,
        modules: [],
      },
      modules: [],
    });

    await expect(service.getForTenant('tenant-a')).resolves.toEqual({
      planType: PlanType.ENTERPRISE,
      maxOutlets: null,
      maxUsers: null,
      maxMonthlyOrders: null,
      featureModuleKeys: [],
    });
  });

  it('combines package entitlements with active add-on modules', async () => {
    findSubscription.mockResolvedValue({
      plan: {
        type: PlanType.BUSINESS,
        maxOutlets: 5,
        maxUsers: 20,
        maxMonthlyOrders: 10000,
        modules: [{ featureModule: { key: 'INVENTORY' } }],
      },
      modules: [{ featureModule: { key: 'ACCOUNTING' } }],
    });

    await expect(service.getForTenant('tenant-a')).resolves.toMatchObject({
      featureModuleKeys: ['INVENTORY', 'ACCOUNTING'],
    });
  });

  it('only grants active catalog modules assigned to the plan or subscription', async () => {
    findFeatureModule.mockResolvedValue({
      id: 'module-inventory',
      isActive: true,
    });
    findSubscription.mockResolvedValue({
      plan: { modules: [{ moduleId: 'module-inventory' }] },
      modules: [],
    });

    await expect(
      service.getFeatureModuleEntitlement('tenant-a', 'INVENTORY'),
    ).resolves.toBe(true);

    findSubscription.mockResolvedValue({
      plan: { modules: [] },
      modules: [],
    });
    await expect(
      service.getFeatureModuleEntitlement('tenant-a', 'INVENTORY'),
    ).resolves.toBe(false);
  });

  it('fails closed for inactive modules and returns null for unknown keys', async () => {
    findFeatureModule.mockResolvedValue({
      id: 'module-inventory',
      isActive: false,
    });
    await expect(
      service.getFeatureModuleEntitlement('tenant-a', 'INVENTORY'),
    ).resolves.toBe(false);
    expect(findSubscription).not.toHaveBeenCalled();

    findFeatureModule.mockResolvedValue(null);
    await expect(
      service.getFeatureModuleEntitlement('tenant-a', 'UNKNOWN'),
    ).resolves.toBeNull();
  });

  it('rejects adding an outlet when the tenant has reached its plan limit', async () => {
    findSubscription.mockResolvedValue({
      plan: {
        type: PlanType.FREE,
        maxOutlets: 1,
        maxUsers: 3,
        maxMonthlyOrders: 500,
        modules: [],
      },
      modules: [],
    });
    outletCount.mockResolvedValue(1);

    await expect(service.assertCanCreateOutlet('tenant-a')).rejects.toThrow(
      ConflictException,
    );
  });

  it('counts active users and pending invitations against the user limit', async () => {
    findSubscription.mockResolvedValue({
      plan: {
        type: PlanType.FREE,
        maxOutlets: 1,
        maxUsers: 3,
        maxMonthlyOrders: 500,
        modules: [],
      },
      modules: [],
    });
    userCount.mockResolvedValue(2);
    invitationCount.mockResolvedValue(1);

    await expect(service.assertCanCreateUser('tenant-a')).rejects.toThrow(
      ConflictException,
    );
  });
});
