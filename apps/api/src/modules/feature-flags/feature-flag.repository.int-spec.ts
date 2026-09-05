import { PrismaClient } from '@prisma/client';

import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';
import { FeatureFlagAggregate } from './domain/feature-flag.aggregate';
import { FeatureFlagRepository } from './feature-flag.repository';

describe('FeatureFlagRepository integration', () => {
  const prisma = new PrismaClient();
  const repository = new FeatureFlagRepository(prisma as never);
  const tenantA = 'it-feature-flags-tenant-a';
  const tenantB = 'it-feature-flags-tenant-b';

  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    await prisma.$connect();
    await prisma.featureFlag.deleteMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
    await prisma.tenant.upsert({
      where: { id: tenantA },
      create: { id: tenantA, name: 'Integration Tenant A' },
      update: {},
    });
    await prisma.tenant.upsert({
      where: { id: tenantB },
      create: { id: tenantB, name: 'Integration Tenant B' },
      update: {},
    });
  });

  afterEach(async () => {
    await prisma.featureFlag.deleteMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
  });

  afterAll(async () => {
    await prisma.featureFlag.deleteMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantA, tenantB] } },
    });
    await prisma.$disconnect();
  });

  it('persists, finds, paginates, searches, and tenant-scopes feature flags', async () => {
    await repository.save(
      FeatureFlagAggregate.create('it-flag-1', 'it-alpha', tenantA, true),
    );
    await repository.save(
      FeatureFlagAggregate.create('it-flag-2', 'it-beta', tenantA, false),
    );
    await repository.save(
      FeatureFlagAggregate.create('it-flag-3', 'it-alpha', tenantB, false),
    );

    await expect(repository.findById('it-flag-1', tenantB)).resolves.toBeNull();
    const tenantBFlag = await repository.findByKey('it-alpha', tenantB);
    expect(tenantBFlag?.getTenantId()).toBe(tenantB);

    const page = await repository.findAll(tenantA, {
      page: 1,
      limit: 1,
      search: 'alpha',
    });
    expect(page.total).toBe(1);
    expect(page.data[0].getKey()).toBe('it-alpha');
    expect(await repository.existsByKey('it-alpha', tenantA)).toBe(true);
    expect(await repository.existsByKey('it-beta', tenantB)).toBe(false);
  });

  it('soft-deletes, restores, and hard-deletes only records owned by the tenant', async () => {
    const flag = FeatureFlagAggregate.create(
      'it-flag-restore',
      'it-restore',
      tenantA,
      true,
    );
    await repository.save(flag);

    await repository.softDelete(flag.getId(), tenantA);
    await expect(
      repository.findById(flag.getId(), tenantA),
    ).resolves.toBeNull();

    const archived = await repository.findByIdIncludingArchived(
      flag.getId(),
      tenantA,
    );
    expect(archived?.isDeleted()).toBe(true);
    archived?.restore();
    await repository.save(archived!);
    await expect(
      repository.findById(flag.getId(), tenantA),
    ).resolves.not.toBeNull();

    await repository.hardDelete(flag.getId(), tenantB);
    await expect(
      repository.findById(flag.getId(), tenantA),
    ).resolves.not.toBeNull();
    await repository.hardDelete(flag.getId(), tenantA);
    await expect(
      repository.findById(flag.getId(), tenantA),
    ).resolves.toBeNull();
  });
});
