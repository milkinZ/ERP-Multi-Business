import {
  PlanType,
  PlatformAdminRole,
  PrismaClient,
  TenantStatus,
} from '@prisma/client';

import { DomainEventBus } from '../../core/events/domain-event-bus.service';
import { DOMAIN_EVENTS, DomainEvent } from '../../core/events/domain-events';
import { OutboxDispatcherService } from '../../core/events/outbox-dispatcher.service';
import { OutboxPublisher } from '../../infrastructure/events/outbox.publisher';
import { PlatformAuditLogService } from '../audit-logs/platform-audit-log.service';
import { requestContext } from '../../core/request-context/request-context';
import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';
import { BusinessRegistryRepository } from '../business-registry/business-registry.repository';
import { BusinessRegistryService } from '../business-registry/business-registry.service';
import {
  BusinessRegistryAggregate,
  BusinessStatus,
} from '../business-registry/domain/business-registry.aggregate';
import { TenantContextService } from '../tenants/tenant-context.service';
import { TenantsRepository } from '../tenants/tenants.repository';
import { TenantsService } from '../tenants/tenants.service';
import { SuperAdminRepository } from './super-admin.repository';
import { SuperAdminService } from './super-admin.service';

const prisma = new PrismaClient();
const runId = `${process.pid}-${Date.now()}`;
const actor = {
  platformIdentityId: 'it-super-admin-atomicity-actor',
};
const tenantIds = [
  `it-arch001-success-${runId}`,
  `it-arch001-mutation-failure-${runId}`,
  `it-arch001-audit-failure-${runId}`,
  `it-arch001-outbox-failure-${runId}`,
  `it-arch001-concurrent-${runId}`,
  `it-arch001-activate-${runId}`,
  `it-arch001-suspend-${runId}`,
  `it-arch001-restore-${runId}`,
  `it-arch001-activate-audit-failure-${runId}`,
  `it-arch001-activate-outbox-failure-${runId}`,
  `it-arch001-suspend-audit-failure-${runId}`,
  `it-arch001-suspend-outbox-failure-${runId}`,
  `it-arch001-activate-concurrent-${runId}`,
  `it-arch001-suspend-concurrent-${runId}`,
  `it-arch001-activate-v-suspend-${runId}`,
  `it-arch001-business-registry-${runId}`,
  `it-arch001-plan-success-${runId}`,
  `it-arch001-plan-outbox-failure-${runId}`,
  `it-arch001-tenant-delete-${runId}`,
];
const subscriptionId = `it-arch001-subscription-${runId}`;
const eventType = DOMAIN_EVENTS.SUPER_ADMIN_TENANT_DEACTIVATED;
const action = 'super-admin.tenant.deactivated';
const bus = new DomainEventBus();
const dispatchedEvents: DomainEvent[] = [];
bus.subscribe(eventType, (event) => {
  dispatchedEvents.push(event);
  return Promise.resolve();
});
const service = new SuperAdminService(
  new SuperAdminRepository(prisma as never),
  new OutboxPublisher(prisma as never),
  new PlatformAuditLogService(prisma as never),
  prisma as never,
);

function eventPayload(value: unknown): Record<string, unknown> {
  const parsed: unknown =
    typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Expected a serialized domain event object');
  }
  return parsed as Record<string, unknown>;
}

async function outboxRowsForTarget(
  targetTenantId: string,
  type: string = eventType,
) {
  const rows = await prisma.outboxEvent.findMany({
    where: { tenantId: targetTenantId, type },
  });
  return rows.filter((row) => {
    const payload = eventPayload(row.payload).payload;
    return (
      typeof payload === 'object' &&
      payload !== null &&
      (payload as Record<string, unknown>).targetTenantId === targetTenantId
    );
  });
}

async function cleanupTenant(tenantId: string) {
  const outboxRows = await outboxRowsForTarget(tenantId);
  if (outboxRows.length > 0) {
    await prisma.outboxEvent.deleteMany({
      where: { id: { in: outboxRows.map((row) => row.id) } },
    });
  }
  await prisma.outboxEvent.deleteMany({
    where: {
      tenantId,
      type: {
        in: [
          'business.activated',
          'business.suspended',
          'business.archived',
          'business.restored',
        ],
      },
    },
  });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

async function createTenant(
  id: string,
  status: TenantStatus = TenantStatus.ACTIVE,
  deletedAt: Date | null = null,
) {
  await cleanupTenant(id);
  return prisma.tenant.create({
    data: { id, name: id, status, deletedAt },
  });
}

async function ensurePlanPair() {
  const activePlans = await prisma.plan.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    take: 2,
  });
  const createdPlanIds: string[] = [];
  const plans = [...activePlans];

  for (const type of Object.values(PlanType)) {
    if (plans.length === 2) break;
    if (activePlans.some((plan) => plan.type === type)) continue;

    const id = `it-arch001-plan-${plans.length}-${runId}`;
    const plan = await prisma.plan.create({
      data: {
        id,
        type,
        name: id,
        priceCents: 1000 + plans.length,
      },
    });
    plans.push(plan);
    createdPlanIds.push(plan.id);
  }

  if (plans.length < 2) {
    throw new Error('The test database must provide two distinct plan types');
  }

  return { oldPlan: plans[0], newPlan: plans[1], createdPlanIds };
}

async function cleanupPlanFixture(tenantId: string, createdPlanIds: string[]) {
  await prisma.subscriptionHistory.deleteMany({ where: { tenantId } });
  await prisma.subscription.deleteMany({ where: { tenantId } });
  if (createdPlanIds.length > 0) {
    await prisma.plan.deleteMany({ where: { id: { in: createdPlanIds } } });
  }
  const rows = await outboxRowsForTarget(
    tenantId,
    'super-admin.plan-change.scheduled',
  );
  if (rows.length > 0) {
    await prisma.outboxEvent.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
  }
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

function asActor<T>(requestId: string, callback: () => Promise<T>) {
  return requestContext.run(
    {
      platformIdentityId: actor.platformIdentityId,
      requestId,
      correlationId: `correlation-${requestId}`,
    },
    callback,
  );
}

async function installFailureTrigger(
  table: 'Tenant' | 'PlatformAuditLog' | 'OutboxEvent',
  operation: 'UPDATE' | 'INSERT',
  suffix: string,
) {
  const functionName = `it_arch001_fail_${suffix}`;
  const triggerName = `${functionName}_trigger`;
  await prisma.$executeRawUnsafe(
    `DROP TRIGGER IF EXISTS ${triggerName} ON "${table}"`,
  );
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${functionName}()`);
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'ARCH001_FORCED_FAILURE';
    END;
    $$;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER ${triggerName}
    BEFORE ${operation} ON "${table}"
    FOR EACH ROW EXECUTE FUNCTION ${functionName}();
  `);
  return async () => {
    await prisma.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS ${triggerName} ON "${table}"`,
    );
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${functionName}()`);
  };
}

describe('SuperAdminService ARCH-001 PostgreSQL atomicity', () => {
  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    await prisma.$connect();
    await prisma.platformIdentity.upsert({
      where: {
        issuer_subject: {
          issuer: 'integration-test',
          subject: actor.platformIdentityId,
        },
      },
      create: {
        id: actor.platformIdentityId,
        issuer: 'integration-test',
        subject: actor.platformIdentityId,
        role: PlatformAdminRole.PLATFORM_ADMIN,
      },
      update: { disabledAt: null },
    });
  });

  beforeEach(async () => {
    dispatchedEvents.length = 0;
    for (const tenantId of tenantIds) {
      await cleanupTenant(tenantId);
    }
  });

  afterAll(async () => {
    for (const tenantId of tenantIds) {
      await cleanupTenant(tenantId);
    }
    await prisma.$disconnect();
  });

  it('commits the tenant mutation, platform audit, and outbox event together and dispatches after commit', async () => {
    const tenantId = tenantIds[0];
    await createTenant(tenantId);
    const startedAt = new Date();

    await asActor('arch001-success', () =>
      service.deactivateTenant(actor, tenantId, 'integration verification'),
    );

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const audits = await prisma.platformAuditLog.findMany({
      where: { action, resourceId: tenantId, targetTenantId: tenantId },
    });
    const outboxRows = await outboxRowsForTarget(tenantId);
    expect(tenant).toMatchObject({ status: TenantStatus.DEACTIVATED });
    expect(tenant?.deletedAt).toBeInstanceOf(Date);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorUserId: null,
      actorTenantId: null,
      actorPlatformIdentityId: actor.platformIdentityId,
      actorType: 'PLATFORM_IDENTITY',
      action,
      resourceType: 'TENANT',
      resourceId: tenantId,
      targetTenantId: tenantId,
      requestId: 'arch001-success',
      correlationId: 'correlation-arch001-success',
      outcome: 'SUCCESS',
    });
    expect(audits[0].createdAt.getTime()).toBeGreaterThanOrEqual(
      startedAt.getTime(),
    );
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0]).toMatchObject({
      tenantId,
      type: eventType,
      status: 'PENDING',
    });
    const storedEvent = eventPayload(outboxRows[0].payload);
    expect(storedEvent).toMatchObject({
      type: eventType,
      payload: {
        tenantId,
        targetTenantId: tenantId,
        actionedByPlatformIdentityId: actor.platformIdentityId,
        reason: 'integration verification',
      },
    });
    expect(dispatchedEvents).toHaveLength(0);

    const dispatcherPrisma = {
      outboxEvent: {
        count: (args: never) => prisma.outboxEvent.count(args),
        findMany: () =>
          prisma.outboxEvent.findMany({ where: { id: outboxRows[0].id } }),
        update: (args: never) => prisma.outboxEvent.update(args),
      },
    } as never;
    const dispatcher = new OutboxDispatcherService(dispatcherPrisma, bus);
    await requestContext.run({ systemOperation: 'outbox-dispatch' }, () =>
      dispatcher.dispatchBatch(1),
    );

    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0]).toMatchObject({
      type: eventType,
      payload: {
        targetTenantId: tenantId,
        actionedByPlatformIdentityId: actor.platformIdentityId,
      },
    });
    await expect(
      prisma.outboxEvent.findUnique({ where: { id: outboxRows[0].id } }),
    ).resolves.toMatchObject({ status: 'PROCESSED' });
  });

  it('rolls back domain state and leaves no audit or outbox row when the mutation fails', async () => {
    const tenantId = tenantIds[1];
    await createTenant(tenantId);
    const dropTrigger = await installFailureTrigger(
      'Tenant',
      'UPDATE',
      'tenant_mutation',
    );

    try {
      await expect(
        asActor('arch001-mutation-failure', () =>
          service.deactivateTenant(actor, tenantId),
        ),
      ).rejects.toThrow('ARCH001_FORCED_FAILURE');
    } finally {
      await dropTrigger();
    }

    await expect(
      prisma.tenant.findUnique({ where: { id: tenantId } }),
    ).resolves.toMatchObject({ deletedAt: null });
    await expect(
      prisma.platformAuditLog.count({
        where: { action, resourceId: tenantId },
      }),
    ).resolves.toBe(0);
    await expect(outboxRowsForTarget(tenantId)).resolves.toHaveLength(0);
  });

  it('rolls back the tenant mutation when the platform audit insert fails', async () => {
    const tenantId = tenantIds[2];
    await createTenant(tenantId);
    const dropTrigger = await installFailureTrigger(
      'PlatformAuditLog',
      'INSERT',
      'audit_insert',
    );

    try {
      await expect(
        asActor('arch001-audit-failure', () =>
          service.deactivateTenant(actor, tenantId),
        ),
      ).rejects.toThrow('ARCH001_FORCED_FAILURE');
    } finally {
      await dropTrigger();
    }

    await expect(
      prisma.tenant.findUnique({ where: { id: tenantId } }),
    ).resolves.toMatchObject({ deletedAt: null });
    await expect(
      prisma.platformAuditLog.count({
        where: { action, resourceId: tenantId },
      }),
    ).resolves.toBe(0);
    await expect(outboxRowsForTarget(tenantId)).resolves.toHaveLength(0);
  });

  it('rolls back the tenant mutation and audit when the outbox insert fails', async () => {
    const tenantId = tenantIds[3];
    await createTenant(tenantId);
    const dropTrigger = await installFailureTrigger(
      'OutboxEvent',
      'INSERT',
      'outbox_insert',
    );

    try {
      await expect(
        asActor('arch001-outbox-failure', () =>
          service.deactivateTenant(actor, tenantId),
        ),
      ).rejects.toThrow('ARCH001_FORCED_FAILURE');
    } finally {
      await dropTrigger();
    }

    await expect(
      prisma.tenant.findUnique({ where: { id: tenantId } }),
    ).resolves.toMatchObject({ deletedAt: null });
    await expect(
      prisma.platformAuditLog.count({
        where: { action, resourceId: tenantId },
      }),
    ).resolves.toBe(0);
    await expect(outboxRowsForTarget(tenantId)).resolves.toHaveLength(0);
  });

  it('allows only one concurrent deactivation transition and records one audit/outbox pair', async () => {
    const tenantId = tenantIds[4];
    await createTenant(tenantId);

    const results = await Promise.allSettled([
      asActor('arch001-concurrent-a', () =>
        service.deactivateTenant(actor, tenantId),
      ),
      asActor('arch001-concurrent-b', () =>
        service.deactivateTenant(actor, tenantId),
      ),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    expect(tenant?.deletedAt).toBeInstanceOf(Date);
    await expect(
      prisma.platformAuditLog.count({
        where: { action, resourceId: tenantId },
      }),
    ).resolves.toBe(1);
    await expect(outboxRowsForTarget(tenantId)).resolves.toHaveLength(1);
  });

  it('activates a suspended tenant and commits status, platform audit, and outbox', async () => {
    const tenantId = tenantIds[5];
    await createTenant(tenantId, TenantStatus.SUSPENDED);

    await asActor('arch001-activate', () =>
      service.activateTenant(actor, tenantId),
    );

    await expect(
      prisma.tenant.findUnique({ where: { id: tenantId } }),
    ).resolves.toMatchObject({ status: TenantStatus.ACTIVE, deletedAt: null });
    await expect(
      prisma.platformAuditLog.count({
        where: {
          action: 'super-admin.tenant.activated',
          resourceId: tenantId,
          targetTenantId: tenantId,
        },
      }),
    ).resolves.toBe(1);
    await expect(
      outboxRowsForTarget(tenantId, 'super-admin.tenant.activated'),
    ).resolves.toHaveLength(1);
  });

  it('suspends an active tenant and commits status, platform audit, and outbox', async () => {
    const tenantId = tenantIds[6];
    await createTenant(tenantId);

    await asActor('arch001-suspend', () =>
      service.suspendTenant(actor, tenantId, 'integration suspension'),
    );

    await expect(
      prisma.tenant.findUnique({ where: { id: tenantId } }),
    ).resolves.toMatchObject({
      status: TenantStatus.SUSPENDED,
      deletedAt: null,
    });
    await expect(
      prisma.platformAuditLog.count({
        where: {
          action: 'super-admin.tenant.suspended',
          resourceId: tenantId,
          targetTenantId: tenantId,
        },
      }),
    ).resolves.toBe(1);
    await expect(
      outboxRowsForTarget(tenantId, 'super-admin.tenant.suspended'),
    ).resolves.toHaveLength(1);
  });

  it('restores only a deactivated tenant to ACTIVE and clears deletedAt', async () => {
    const tenantId = tenantIds[7];
    await createTenant(tenantId, TenantStatus.DEACTIVATED, new Date());

    await asActor('arch001-restore', () =>
      service.restoreTenant(actor, tenantId),
    );

    await expect(
      prisma.tenant.findUnique({ where: { id: tenantId } }),
    ).resolves.toMatchObject({ status: TenantStatus.ACTIVE, deletedAt: null });
    await expect(
      prisma.platformAuditLog.count({
        where: {
          action: 'super-admin.tenant.restored',
          resourceId: tenantId,
          targetTenantId: tenantId,
        },
      }),
    ).resolves.toBe(1);
    await expect(
      outboxRowsForTarget(tenantId, 'super-admin.tenant.restored'),
    ).resolves.toHaveLength(1);
  });

  it.each([
    ['audit', 'PlatformAuditLog', 'INSERT'],
    ['outbox', 'OutboxEvent', 'INSERT'],
  ] as const)(
    'keeps activation state suspended when its %s write fails',
    async (failurePoint, table, operation) => {
      const tenantId = failurePoint === 'audit' ? tenantIds[8] : tenantIds[9];
      await createTenant(tenantId, TenantStatus.SUSPENDED);
      const dropTrigger = await installFailureTrigger(
        table,
        operation,
        `activate_${failurePoint}`,
      );

      try {
        await expect(
          asActor(`arch001-activate-${failurePoint}-failure`, () =>
            service.activateTenant(actor, tenantId),
          ),
        ).rejects.toThrow('ARCH001_FORCED_FAILURE');
      } finally {
        await dropTrigger();
      }

      await expect(
        prisma.tenant.findUnique({ where: { id: tenantId } }),
      ).resolves.toMatchObject({
        status: TenantStatus.SUSPENDED,
        deletedAt: null,
      });
      await expect(
        prisma.platformAuditLog.count({
          where: {
            action: 'super-admin.tenant.activated',
            resourceId: tenantId,
          },
        }),
      ).resolves.toBe(0);
      await expect(
        outboxRowsForTarget(tenantId, 'super-admin.tenant.activated'),
      ).resolves.toHaveLength(0);
    },
  );

  it.each([
    ['audit', 'PlatformAuditLog', 'INSERT'],
    ['outbox', 'OutboxEvent', 'INSERT'],
  ] as const)(
    'keeps suspension state active when its %s write fails',
    async (failurePoint, table, operation) => {
      const tenantId = failurePoint === 'audit' ? tenantIds[10] : tenantIds[11];
      await createTenant(tenantId);
      const dropTrigger = await installFailureTrigger(
        table,
        operation,
        `suspend_${failurePoint}`,
      );

      try {
        await expect(
          asActor(`arch001-suspend-${failurePoint}-failure`, () =>
            service.suspendTenant(actor, tenantId),
          ),
        ).rejects.toThrow('ARCH001_FORCED_FAILURE');
      } finally {
        await dropTrigger();
      }

      await expect(
        prisma.tenant.findUnique({ where: { id: tenantId } }),
      ).resolves.toMatchObject({
        status: TenantStatus.ACTIVE,
        deletedAt: null,
      });
      await expect(
        prisma.platformAuditLog.count({
          where: {
            action: 'super-admin.tenant.suspended',
            resourceId: tenantId,
          },
        }),
      ).resolves.toBe(0);
      await expect(
        outboxRowsForTarget(tenantId, 'super-admin.tenant.suspended'),
      ).resolves.toHaveLength(0);
    },
  );

  it('allows only one of two concurrent activations from SUSPENDED', async () => {
    const tenantId = tenantIds[12];
    await createTenant(tenantId, TenantStatus.SUSPENDED);

    const results = await Promise.allSettled([
      asActor('arch001-activate-concurrent-a', () =>
        service.activateTenant(actor, tenantId),
      ),
      asActor('arch001-activate-concurrent-b', () =>
        service.activateTenant(actor, tenantId),
      ),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    await expect(
      prisma.tenant.findUnique({ where: { id: tenantId } }),
    ).resolves.toMatchObject({ status: TenantStatus.ACTIVE });
    await expect(
      prisma.platformAuditLog.count({
        where: { action: 'super-admin.tenant.activated', resourceId: tenantId },
      }),
    ).resolves.toBe(1);
    await expect(
      outboxRowsForTarget(tenantId, 'super-admin.tenant.activated'),
    ).resolves.toHaveLength(1);
  });

  it('allows only one of two concurrent suspensions from ACTIVE', async () => {
    const tenantId = tenantIds[13];
    await createTenant(tenantId);

    const results = await Promise.allSettled([
      asActor('arch001-suspend-concurrent-a', () =>
        service.suspendTenant(actor, tenantId),
      ),
      asActor('arch001-suspend-concurrent-b', () =>
        service.suspendTenant(actor, tenantId),
      ),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    await expect(
      prisma.tenant.findUnique({ where: { id: tenantId } }),
    ).resolves.toMatchObject({ status: TenantStatus.SUSPENDED });
    await expect(
      prisma.platformAuditLog.count({
        where: { action: 'super-admin.tenant.suspended', resourceId: tenantId },
      }),
    ).resolves.toBe(1);
    await expect(
      outboxRowsForTarget(tenantId, 'super-admin.tenant.suspended'),
    ).resolves.toHaveLength(1);
  });

  it('resolves concurrent activation versus suspension from SUSPENDED deterministically', async () => {
    const tenantId = tenantIds[14];
    await createTenant(tenantId, TenantStatus.SUSPENDED);

    const results = await Promise.allSettled([
      asActor('arch001-activate-v-suspend-activate', () =>
        service.activateTenant(actor, tenantId),
      ),
      asActor('arch001-activate-v-suspend-suspend', () =>
        service.suspendTenant(actor, tenantId),
      ),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    await expect(
      prisma.tenant.findUnique({ where: { id: tenantId } }),
    ).resolves.toMatchObject({ status: TenantStatus.ACTIVE });
    await expect(
      prisma.platformAuditLog.count({
        where: { action: 'super-admin.tenant.activated', resourceId: tenantId },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.platformAuditLog.count({
        where: { action: 'super-admin.tenant.suspended', resourceId: tenantId },
      }),
    ).resolves.toBe(0);
    await expect(
      outboxRowsForTarget(tenantId, 'super-admin.tenant.activated'),
    ).resolves.toHaveLength(1);
    await expect(
      outboxRowsForTarget(tenantId, 'super-admin.tenant.suspended'),
    ).resolves.toHaveLength(0);
  });

  it('round-trips business-registry suspension, archive, and restore through tenant lifecycle state', async () => {
    const tenantId = tenantIds[15];
    await createTenant(tenantId);
    const repository = new BusinessRegistryRepository(prisma as never);
    const aggregate = BusinessRegistryAggregate.reconstitute({
      id: tenantId,
      tenantId,
      name: tenantId,
      businessType: 'CAFE',
      status: BusinessStatus.ACTIVE,
      deletedAt: null,
    });

    aggregate.suspend('registry suspension');
    await requestContext.run({ tenantId }, () => repository.save(aggregate));
    const suspended = await requestContext.run({ tenantId }, () =>
      repository.findById(tenantId, tenantId),
    );
    expect(suspended?.status).toBe(BusinessStatus.SUSPENDED);
    await expect(
      prisma.tenant.findUnique({ where: { id: tenantId } }),
    ).resolves.toMatchObject({
      status: TenantStatus.SUSPENDED,
      deletedAt: null,
    });
    if (!suspended) throw new Error('Expected suspended business registry');

    suspended.archive();
    await requestContext.run({ tenantId }, () => repository.save(suspended));
    const archived = await requestContext.run({ tenantId }, () =>
      repository.findById(tenantId, tenantId),
    );
    expect(archived?.status).toBe(BusinessStatus.ARCHIVED);
    const deactivatedTenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    expect(deactivatedTenant?.status).toBe(TenantStatus.DEACTIVATED);
    expect(deactivatedTenant?.deletedAt).toBeInstanceOf(Date);
    if (!archived) throw new Error('Expected archived business registry');

    archived.restore();
    await requestContext.run({ tenantId }, () => repository.save(archived));
    const restored = await requestContext.run({ tenantId }, () =>
      repository.findById(tenantId, tenantId),
    );
    expect(restored?.status).toBe(BusinessStatus.ACTIVE);
    await expect(
      prisma.tenant.findUnique({ where: { id: tenantId } }),
    ).resolves.toMatchObject({ status: TenantStatus.ACTIVE, deletedAt: null });
    await expect(
      prisma.outboxEvent.count({
        where: {
          tenantId,
          type: {
            in: [
              'business.suspended',
              'business.archived',
              'business.restored',
            ],
          },
        },
      }),
    ).resolves.toBe(3);
  });

  it('routes tenant DELETE through the persisted business archive lifecycle', async () => {
    const tenantId = tenantIds[18];
    await createTenant(tenantId);
    const tenantContext = new TenantContextService();
    const businessRepository = new BusinessRegistryRepository(prisma as never);
    const businessRegistry = new BusinessRegistryService(
      businessRepository,
      tenantContext,
    );
    const tenants = new TenantsService(
      tenantContext,
      new TenantsRepository(prisma as never),
      businessRegistry,
    );

    await requestContext.run({ tenantId }, () => tenants.softDelete(tenantId));

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    expect(tenant?.status).toBe(TenantStatus.DEACTIVATED);
    expect(tenant?.deletedAt).toBeInstanceOf(Date);
    await expect(
      prisma.outboxEvent.count({
        where: { tenantId, type: 'business.archived' },
      }),
    ).resolves.toBe(1);
  });

  it('commits plan change, platform audit, and outbox in one PostgreSQL transaction', async () => {
    const tenantId = tenantIds[16];
    await createTenant(tenantId);
    const { oldPlan, newPlan, createdPlanIds } = await ensurePlanPair();
    await prisma.subscription.create({
      data: {
        id: subscriptionId,
        tenantId,
        planId: oldPlan.id,
      },
    });

    try {
      await asActor('arch001-plan-success', () =>
        service.changeTenantPlan(actor, tenantId, newPlan.id),
      );

      await expect(
        prisma.subscription.findUnique({ where: { id: subscriptionId } }),
      ).resolves.toMatchObject({
        planId: oldPlan.id,
        pendingPlanId: newPlan.id,
      });
      await expect(
        prisma.platformAuditLog.count({
          where: {
            action: 'super-admin.plan.change-scheduled',
            resourceId: subscriptionId,
            targetTenantId: tenantId,
          },
        }),
      ).resolves.toBe(1);
      await expect(
        outboxRowsForTarget(tenantId, 'super-admin.plan-change.scheduled'),
      ).resolves.toHaveLength(1);
      const scheduledEvents = await prisma.outboxEvent.findMany({
        where: {
          tenantId,
          type: 'subscription.plan-change.scheduled',
        },
      });
      expect(
        scheduledEvents.some((row) => {
          const payload = eventPayload(row.payload).payload;
          return (
            typeof payload === 'object' &&
            payload !== null &&
            'subscriptionId' in payload &&
            payload.subscriptionId === subscriptionId
          );
        }),
      ).toBe(true);
    } finally {
      await cleanupPlanFixture(tenantId, createdPlanIds);
    }
  });

  it('rolls back plan and audit when its outbox insert fails', async () => {
    const tenantId = tenantIds[17];
    await createTenant(tenantId);
    const { oldPlan, newPlan, createdPlanIds } = await ensurePlanPair();
    await prisma.subscription.create({
      data: {
        id: subscriptionId,
        tenantId,
        planId: oldPlan.id,
      },
    });
    const dropTrigger = await installFailureTrigger(
      'OutboxEvent',
      'INSERT',
      'plan_outbox_insert',
    );

    try {
      await expect(
        asActor('arch001-plan-outbox-failure', () =>
          service.changeTenantPlan(actor, tenantId, newPlan.id),
        ),
      ).rejects.toThrow('ARCH001_FORCED_FAILURE');
    } finally {
      await dropTrigger();
      await cleanupPlanFixture(tenantId, createdPlanIds);
    }

    await expect(
      prisma.platformAuditLog.count({
        where: {
          action: 'super-admin.plan.change-scheduled',
          resourceId: subscriptionId,
          targetTenantId: tenantId,
        },
      }),
    ).resolves.toBe(0);
  });
});
