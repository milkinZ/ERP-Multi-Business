import { createHash } from 'node:crypto';

import { TENANT_ASSIGNABLE_PERMISSION_CODES } from '../rbac/tenant-permissions';
import { TenantRegistrationService } from './tenant-registration.service';

describe('TenantRegistrationService', () => {
  const input = {
    name: 'Cafe Example',
    email: ' Owner@Example.Test ',
    planId: 'plan-free',
    businessType: 'CAFE' as const,
    currencyCode: 'IDR',
  };
  const plan = {
    id: 'plan-free',
    type: 'FREE',
    name: 'Free',
    priceCents: 0,
    modules: [],
  };
  const email = {
    sendTenantOwnerVerification: jest
      .fn<Promise<void>, [string, string]>()
      .mockResolvedValue(undefined),
  };
  const config = {
    getOrThrow: jest.fn().mockReturnValue('https://erp.example.test'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('only lists non-deleted plans with public feature information', async () => {
    const prisma = {
      plan: {
        findMany: jest.fn().mockResolvedValue([
          {
            ...plan,
            maxOutlets: 1,
            maxUsers: 3,
            maxMonthlyOrders: 500,
            modules: [
              {
                featureModule: {
                  key: 'reports',
                  name: 'Reports',
                  description: 'Business reports',
                },
              },
            ],
          },
        ]),
      },
    };
    const service = new TenantRegistrationService(
      prisma as never,
      config as never,
      email as never,
    );

    await expect(service.listPlans()).resolves.toMatchObject([
      {
        id: 'plan-free',
        modules: [{ key: 'reports', name: 'Reports' }],
      },
    ]);
    expect(prisma.plan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } }),
    );
  });

  it('returns the generic response without provisioning for an existing owner email', async () => {
    const transaction = {
      $queryRaw: jest.fn(),
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing-user' }),
      },
      userInvitation: { findFirst: jest.fn() },
      tenant: { create: jest.fn() },
    };
    const prisma = {
      plan: { findFirst: jest.fn().mockResolvedValue(plan) },
      $transaction: jest.fn(
        (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const service = new TenantRegistrationService(
      prisma as never,
      config as never,
      email as never,
    );

    await expect(service.register(input)).resolves.toEqual({
      message:
        'If registration can proceed, a verification link will be sent to that email address.',
    });
    expect(transaction.userInvitation.findFirst).toHaveBeenCalledTimes(1);
    expect(transaction.tenant.create).not.toHaveBeenCalled();
    expect(email.sendTenantOwnerVerification).not.toHaveBeenCalled();
  });

  it('creates an Owner invitation and only sends a hashed one-time token by email', async () => {
    const transaction = {
      $queryRaw: jest.fn(),
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      userInvitation: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(
          (args: { data: { email: string; tokenHash: string } }) =>
            Promise.resolve({ id: 'invitation-1', ...args.data }),
        ),
      },
      tenant: {
        create: jest.fn(
          (args: {
            data: {
              name: string;
              contactEmail: string;
              businessType: string;
              currencyCode: string;
              status: string;
            };
          }) =>
            Promise.resolve({
              id: 'tenant-1',
              name: args.data.name,
            }),
        ),
      },
      permission: {
        findMany: jest.fn().mockResolvedValue(
          TENANT_ASSIGNABLE_PERMISSION_CODES.map((code) => ({
            id: `permission-${code}`,
            code,
          })),
        ),
      },
      role: {
        upsert: jest.fn(
          (args: {
            where: {
              tenantId: string;
              tenantId_systemKey: { systemKey: string };
            };
          }) => ({
            id: `role-${args.where.tenantId}-${args.where.tenantId_systemKey.systemKey}`,
          }),
        ),
      },
      subscription: {
        create: jest.fn((args: { data: { status: string } }) =>
          Promise.resolve({ id: 'subscription-1', status: args.data.status }),
        ),
      },
      subscriptionHistory: { create: jest.fn() },
      platformAuditLog: { create: jest.fn() },
    };
    const prisma = {
      plan: { findFirst: jest.fn().mockResolvedValue(plan) },
      $transaction: jest.fn(
        (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const service = new TenantRegistrationService(
      prisma as never,
      config as never,
      email as never,
    );

    await expect(service.register(input)).resolves.toMatchObject({
      message:
        'If registration can proceed, a verification link will be sent to that email address.',
    });

    expect(transaction.tenant.create.mock.calls[0]?.[0].data).toEqual({
      name: 'Cafe Example',
      contactEmail: 'owner@example.test',
      businessType: 'CAFE',
      currencyCode: 'IDR',
      status: 'SUSPENDED',
    });
    expect(transaction.subscription.create.mock.calls[0]?.[0].data).toEqual(
      expect.objectContaining({ status: 'INACTIVE' }),
    );
    expect(email.sendTenantOwnerVerification).toHaveBeenCalledWith(
      'owner@example.test',
      expect.stringMatching(/^https:\/\/erp\.example\.test\/register\?token=/),
    );
    const sentSetupUrl = email.sendTenantOwnerVerification.mock.calls[0]?.[1];
    if (!sentSetupUrl) throw new Error('Verification email was not sent');
    const verificationToken = new URL(sentSetupUrl).searchParams.get('token');
    if (!verificationToken) {
      throw new Error('Verification token is missing from the setup URL');
    }
    const invitationData =
      transaction.userInvitation.create.mock.calls[0]?.[0].data;
    expect(invitationData).toMatchObject({
      email: 'owner@example.test',
      isSelfRegistration: true,
      tokenHash: createHash('sha256').update(verificationToken).digest('hex'),
    });
  });
});
