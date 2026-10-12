import { PrismaService } from '../../core/database/prisma.service';
import { requestContext } from '../../core/request-context/request-context';
import { PlatformAuditLogService } from './platform-audit-log.service';

describe('PlatformAuditLogService', () => {
  const create = jest.fn();
  const findMany = jest.fn();
  const count = jest.fn();
  const findUnique = jest.fn();
  const prisma = {
    platformAuditLog: { create, findMany, count, findUnique },
  } as unknown as PrismaService;
  const service = new PlatformAuditLogService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    create.mockResolvedValue({
      id: 'platform-audit-1',
      actorUserId: 'admin-1',
      actorTenantId: 'platform-tenant',
      actorType: 'PLATFORM_USER',
      action: 'super-admin.tenant.suspended',
      resourceType: 'TENANT',
      resourceId: 'tenant-1',
      targetTenantId: 'tenant-1',
      requestId: 'request-1',
      correlationId: 'correlation-1',
      metadata: { to: 'SUSPENDED' },
      outcome: 'SUCCESS',
      createdAt: new Date('2026-09-25T00:00:00Z'),
    });
  });

  it('derives actor and request context without accepting client scope', async () => {
    await requestContext.run(
      {
        requestId: 'request-1',
        correlationId: 'correlation-1',
      },
      () =>
        service.create({
          actor: { userId: 'admin-1', tenantId: 'platform-tenant' },
          action: 'super-admin.tenant.suspended',
          resourceType: 'TENANT',
          resourceId: 'tenant-1',
          targetTenantId: 'tenant-1',
          metadata: { to: 'SUSPENDED' },
        }),
    );

    const [call] = create.mock.calls as [[{ data: Record<string, unknown> }]];
    expect(call[0].data).toMatchObject({
      actorUserId: 'admin-1',
      actorTenantId: 'platform-tenant',
      targetTenantId: 'tenant-1',
      requestId: 'request-1',
      correlationId: 'correlation-1',
    });
  });

  it('uses bounded pagination and deterministic ordering', async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await service.list({
      page: 2,
      limit: 500,
      action: 'super-admin.plan.changed',
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { action: 'super-admin.plan.changed' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 100,
      take: 100,
    });
  });
});
