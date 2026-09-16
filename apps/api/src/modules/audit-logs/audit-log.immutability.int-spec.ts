import { PrismaClient } from '@prisma/client';

import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';

const prisma = new PrismaClient();
const tenantId = 'it-audit-immutable-tenant';
const auditId = 'it-audit-immutable-record';

describe('AuditLog database immutability', () => {
  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    await prisma.$connect();
    await prisma.tenant.upsert({
      where: { id: tenantId },
      update: {},
      create: {
        id: tenantId,
        name: 'Audit Immutable Tenant',
        businessType: 'RETAIL',
      },
    });
    await prisma.auditLog.create({
      data: {
        id: auditId,
        tenantId,
        entity: 'Order',
        entityId: 'order-a',
        action: 'CREATE',
        metadata: { source: 'integration' },
      },
    });
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog"');
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('allows creation but rejects updates and deletes at PostgreSQL trigger level', async () => {
    await expect(
      prisma.auditLog.update({
        where: { id: auditId },
        data: { action: 'DELETE' },
      }),
    ).rejects.toThrow('AuditLog records are append-only');
    await expect(
      prisma.auditLog.delete({ where: { id: auditId } }),
    ).rejects.toThrow('AuditLog records are append-only');
    await expect(
      prisma.auditLog.findUnique({ where: { id: auditId } }),
    ).resolves.toEqual(expect.objectContaining({ action: 'CREATE', tenantId }));
  });
});
