import { PrismaClient } from '@prisma/client';

import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';

const prisma = new PrismaClient();

describe('Platform settings PostgreSQL integration', () => {
  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('returns a Prisma-readable value when acquiring the Autopay policy lock', async () => {
    await expect(
      prisma.$transaction(
        (tx) =>
          tx.$queryRaw<Array<{ locked: boolean }>>`
          SELECT pg_advisory_xact_lock(7281946301) IS NULL AS locked
        `,
      ),
    ).resolves.toEqual([{ locked: false }]);
  });

  it('does not expose PostgreSQL void values to Prisma raw-query deserialization', async () => {
    await expect(
      prisma.$transaction(
        (tx) => tx.$queryRaw`SELECT pg_advisory_xact_lock(7281946301)`,
      ),
    ).rejects.toThrow();
  });
});
