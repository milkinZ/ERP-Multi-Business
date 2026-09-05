import { assertSafeIntegrationEnvironment } from './integration-environment';

describe('integration environment guard', () => {
  const originalEnvironment = process.env;

  beforeEach(() => {
    process.env = { ...originalEnvironment };
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it('accepts only a dedicated test database and isolated Redis database', () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@127.0.0.1:5432/cafe_os_test';
    process.env.REDIS_URL = 'redis://127.0.0.1:6379/15';

    expect(assertSafeIntegrationEnvironment).not.toThrow();
  });

  it('rejects development database names', () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@127.0.0.1:5432/cafe_os';
    process.env.REDIS_URL = 'redis://127.0.0.1:6379/15';

    expect(assertSafeIntegrationEnvironment).toThrow('must end in _test');
  });

  it('rejects Redis database zero', () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@127.0.0.1:5432/cafe_os_test';
    process.env.REDIS_URL = 'redis://127.0.0.1:6379/0';

    expect(assertSafeIntegrationEnvironment).toThrow(
      'non-zero database number',
    );
  });

  it('rejects missing integration configuration', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;

    expect(assertSafeIntegrationEnvironment).toThrow('require DATABASE_URL');
  });

  it('rejects non-test execution environments', () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@127.0.0.1:5432/cafe_os_test';
    process.env.REDIS_URL = 'redis://127.0.0.1:6379/15';

    expect(assertSafeIntegrationEnvironment).toThrow('require NODE_ENV=test');
  });
});
