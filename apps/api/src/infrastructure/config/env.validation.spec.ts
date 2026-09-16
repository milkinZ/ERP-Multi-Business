import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const base = {
    DATABASE_URL: 'postgresql://localhost/test',
    JWT_SECRET: '12345678901234567890123456789012',
  };

  it('accepts required configuration and applies defaults', () => {
    expect(validateEnv(base)).toEqual(
      expect.objectContaining({
        NODE_ENV: 'development',
        CORS_ORIGIN: 'http://localhost:3000',
        APP_VERSION: '1',
        METRICS_ENABLED: 'true',
      }),
    );
  });

  it('rejects missing database configuration and short JWT secrets', () => {
    expect(() => validateEnv({ JWT_SECRET: 'short' })).toThrow();
    expect(() => validateEnv({ DATABASE_URL: base.DATABASE_URL })).toThrow();
  });

  it('rejects invalid production enum and trace sampling values', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'staging' })).toThrow();
    expect(() => validateEnv({ ...base, TRACE_SAMPLING_RATE: 1.1 })).toThrow();
  });
});
