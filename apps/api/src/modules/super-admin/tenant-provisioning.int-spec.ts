import { BadRequestException } from '@nestjs/common';
import { PrismaClient, PlatformAdminRole } from '@prisma/client';

import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';
import { OutboxPublisher } from '../../infrastructure/events/outbox.publisher';
import { PlatformAuditLogService } from '../audit-logs/platform-audit-log.service';
import { TENANT_ASSIGNABLE_PERMISSION_CODES } from '../rbac/tenant-permissions';
import { BillingRepository } from '../billing/billing.repository';
import { BillingService } from '../billing/billing.service';
import { SubscriptionRepository } from '../subscription/domain/subscription.repository';
import { PlanRepository } from '../subscription/plans/plan.repository';
import { TenantContextService } from '../tenants/tenant-context.service';
import { TenantProvisioningService } from './tenant-provisioning.service';

const prisma = new PrismaClient();
const runId = `${process.pid}-${Date.now()}`;
const actorId = `it-tenant-provisioning-actor-${runId}`;
let paidPlanId: string;
let paidPlanPriceCents: number;
let freePlanId: string;
let freePlanPriceCents: number;
const createdPlanIds: string[] = [];
const tenantPrefix = `it-tenant-provisioning-${runId}`;
let lastSetupUrl: string | undefined;
const email = {
  sendUserInvitation: jest.fn((_email: string, setupUrl: string) => {
    lastSetupUrl = setupUrl;
    return Promise.resolve();
  }),
};
const config = {
  getOrThrow: jest.fn().mockReturnValue('https://erp.example.test'),
};
const billing = new BillingService(
  new BillingRepository(prisma as never),
  new SubscriptionRepository(prisma as never),
  new PlanRepository(prisma as never),
  new TenantContextService(),
  new OutboxPublisher(prisma as never),
);
const service = new TenantProvisioningService(
  prisma as never,
  new PlatformAuditLogService(prisma as never),
  config as never,
  email as never,
  billing,
);
const actor = { platformIdentityId: actorId };

async function cleanup(removePlans = false) {
  const tenants = await prisma.tenant.findMany({
    where: { name: { startsWith: tenantPrefix } },
    select: { id: true },
  });
  const tenantIds = tenants.map((tenant) => tenant.id);
  if (tenantIds.length) {
    await prisma.outboxEvent.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await prisma.userInvitation.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await prisma.invoice.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.subscriptionHistory.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await prisma.subscription.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await prisma.rolePermission.deleteMany({
      where: { Role: { tenantId: { in: tenantIds } } },
    });
    await prisma.role.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  }
  if (removePlans) {
    await prisma.plan.deleteMany({ where: { id: { in: createdPlanIds } } });
    createdPlanIds.length = 0;
  }
}

describe('Platform tenant provisioning PostgreSQL integration', () => {
  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    await prisma.$connect();
    await cleanup();
    await prisma.platformIdentity.upsert({
      where: {
        issuer_subject: {
          issuer: 'integration-test',
          subject: actorId,
        },
      },
      create: {
        id: actorId,
        issuer: 'integration-test',
        subject: actorId,
        role: PlatformAdminRole.PLATFORM_ADMIN,
      },
      update: { disabledAt: null },
    });
    await prisma.permission.createMany({
      data: TENANT_ASSIGNABLE_PERMISSION_CODES.map((code) => ({
        code,
        name: code,
      })),
      skipDuplicates: true,
    });
    const starterPlan = await prisma.plan.findFirst({
      where: { type: 'STARTER', deletedAt: null },
      select: { id: true, priceCents: true },
    });
    if (starterPlan) {
      paidPlanId = starterPlan.id;
      paidPlanPriceCents = starterPlan.priceCents;
    } else {
      paidPlanId = `it-tenant-provisioning-plan-${runId}`;
      paidPlanPriceCents = 199000;
      await prisma.plan.create({
        data: {
          id: paidPlanId,
          type: 'STARTER',
          name: `${tenantPrefix} Starter`,
          priceCents: paidPlanPriceCents,
        },
      });
      createdPlanIds.push(paidPlanId);
    }

    const freePlan = await prisma.plan.findFirst({
      where: { type: 'FREE', deletedAt: null },
      select: { id: true, priceCents: true },
    });
    if (freePlan) {
      freePlanId = freePlan.id;
      freePlanPriceCents = freePlan.priceCents;
    } else {
      freePlanId = `it-tenant-provisioning-free-plan-${runId}`;
      freePlanPriceCents = 0;
      await prisma.plan.create({
        data: {
          id: freePlanId,
          type: 'FREE',
          name: `${tenantPrefix} Free`,
          priceCents: 0,
        },
      });
      createdPlanIds.push(freePlanId);
    }
  });

  beforeEach(async () => {
    await cleanup();
    email.sendUserInvitation.mockClear();
    lastSetupUrl = undefined;
  });

  afterAll(async () => {
    await cleanup(true);
    await prisma.$disconnect();
  });

  it('creates the tenant, Owner invitation, subscription, invoice, and platform audit', async () => {
    const result = await service.createTenant(actor, {
      name: `${tenantPrefix}-success`,
      ownerEmail: `${tenantPrefix}@example.test`,
      planId: paidPlanId,
    });

    expect(result).toMatchObject({
      tenant: { businessType: 'CAFE', currencyCode: 'IDR' },
      subscription: { planId: paidPlanId, status: 'ACTIVE' },
      invoice: {
        amountCents: paidPlanPriceCents,
        currency: 'IDR',
        status: 'PENDING',
      },
      ownerInvitation: {
        email: `${tenantPrefix}@example.test`,
        status: 'PENDING',
      },
    });
    expect(email.sendUserInvitation).toHaveBeenCalledWith(
      `${tenantPrefix}@example.test`,
      expect.stringContaining('/register?token='),
    );

    const invitation = await prisma.userInvitation.findUniqueOrThrow({
      where: { id: result.ownerInvitation.id },
      include: { Roles: { include: { Role: true } } },
    });
    expect(invitation.invitedByUserId).toBeNull();
    expect(invitation.invitedByPlatformIdentityId).toBe(actorId);
    const setupUrl = new URL(lastSetupUrl ?? '');
    const setupToken = setupUrl.searchParams.get('token');
    expect(setupToken).toBeTruthy();
    expect(invitation.tokenHash).not.toBe(setupToken);
    expect(invitation.Roles).toHaveLength(1);
    expect(invitation.Roles[0]?.Role.tenantId).toBe(result.tenant.id);
    expect(invitation.Roles[0]?.Role.systemKey).toBe('OWNER');
    const auditLog = await prisma.platformAuditLog.findFirst({
      where: {
        targetTenantId: result.tenant.id,
        action: 'super-admin.tenant.provisioned',
      },
    });
    expect(auditLog?.actorPlatformIdentityId).toBe(actorId);
    expect(auditLog?.outcome).toBe('SUCCESS');
    const history = await prisma.subscriptionHistory.findFirst({
      where: {
        tenantId: result.tenant.id,
        eventType: 'TENANT_PROVISIONED',
      },
    });
    expect(history?.actorPlatformIdentityId).toBe(actorId);
    expect(history?.actorType).toBe('PLATFORM_IDENTITY');
  });

  it('rejects a free plan before creating any tenant or invitation', async () => {
    await prisma.plan.update({
      where: { id: freePlanId },
      data: { priceCents: 0 },
    });
    try {
      await expect(
        service.createTenant(actor, {
          name: `${tenantPrefix}-free`,
          ownerEmail: `${tenantPrefix}-free@example.test`,
          planId: freePlanId,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        prisma.tenant.count({ where: { name: `${tenantPrefix}-free` } }),
      ).resolves.toBe(0);
      expect(email.sendUserInvitation).not.toHaveBeenCalled();
    } finally {
      await prisma.plan.update({
        where: { id: freePlanId },
        data: { priceCents: freePlanPriceCents },
      });
    }
  });

  it('prevents concurrent provisioning requests for the same initial owner', async () => {
    const ownerEmail = `${tenantPrefix}-concurrent@example.test`;
    const results = await Promise.allSettled([
      service.createTenant(actor, {
        name: `${tenantPrefix}-concurrent-a`,
        ownerEmail,
        planId: paidPlanId,
      }),
      service.createTenant(actor, {
        name: `${tenantPrefix}-concurrent-b`,
        ownerEmail,
        planId: paidPlanId,
      }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const createdTenants = await prisma.tenant.findMany({
      where: { contactEmail: ownerEmail },
      select: { id: true },
    });
    expect(createdTenants).toHaveLength(1);
    const createdTenant = createdTenants[0];
    if (!createdTenant) {
      throw new Error('Expected exactly one tenant to be provisioned');
    }
    await expect(
      prisma.userInvitation.count({
        where: { tenantId: createdTenant.id, revokedAt: null },
      }),
    ).resolves.toBe(1);
    expect(email.sendUserInvitation).toHaveBeenCalledTimes(1);
  });

  it('revokes the owner invitation and records failure when email delivery fails', async () => {
    email.sendUserInvitation.mockRejectedValueOnce(new Error('SMTP failed'));
    await expect(
      service.createTenant(actor, {
        name: `${tenantPrefix}-email-failure`,
        ownerEmail: `${tenantPrefix}-failure@example.test`,
        planId: paidPlanId,
      }),
    ).rejects.toThrow('Owner invitation email could not be delivered');

    const tenant = await prisma.tenant.findFirstOrThrow({
      where: { name: `${tenantPrefix}-email-failure` },
      select: { id: true },
    });
    const invitation = await prisma.userInvitation.findFirst({
      where: { tenantId: tenant.id },
      select: { revokedAt: true },
    });
    expect(invitation?.revokedAt).toBeInstanceOf(Date);
    const auditLog = await prisma.platformAuditLog.findFirst({
      where: {
        targetTenantId: tenant.id,
        action: 'super-admin.tenant.owner-invitation.delivery-failed',
      },
    });
    expect(auditLog?.outcome).toBe('FAILURE');
  });
});
