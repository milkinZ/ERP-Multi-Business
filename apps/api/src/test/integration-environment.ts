const TEST_DATABASE_SUFFIX = /_test$/;

/** Prevent test infrastructure from connecting to development or production. */
export function assertSafeIntegrationEnvironment(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Integration tests require NODE_ENV=test.');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'Integration tests require DATABASE_URL for a dedicated *_test database.',
    );
  }

  let databaseName: string;
  try {
    databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  } catch {
    throw new Error(
      'Integration tests require a valid PostgreSQL DATABASE_URL.',
    );
  }

  if (!TEST_DATABASE_SUFFIX.test(databaseName)) {
    throw new Error(
      `Refusing integration database "${databaseName}". Its name must end in _test.`,
    );
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('Integration tests require an isolated REDIS_URL.');
  }

  let redisDatabase: string;
  try {
    redisDatabase = new URL(redisUrl).pathname.replace(/^\//, '');
  } catch {
    throw new Error('Integration tests require a valid REDIS_URL.');
  }

  if (!redisDatabase || redisDatabase === '0') {
    throw new Error('Integration Redis must use a non-zero database number.');
  }
}
