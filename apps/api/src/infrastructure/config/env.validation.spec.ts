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

  it('requires complete HTTPS OIDC and MFA assurance configuration in production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(
      /Platform OIDC must be fully configured/,
    );

    const platformOidc = {
      PLATFORM_OIDC_ISSUER: 'https://identity.example.test/realms/erp',
      PLATFORM_OIDC_CLIENT_ID: 'platform-client',
      PLATFORM_OIDC_CLIENT_SECRET: 'client-secret',
      PLATFORM_OIDC_CALLBACK_URL:
        'https://api.example.test/auth/platform/oidc/callback',
      PLATFORM_OIDC_FRONTEND_CALLBACK_URL:
        'https://app.example.test/platform/auth/callback',
      PLATFORM_OIDC_STATE_HMAC_SECRET:
        'state-hmac-secret-long-enough-for-production',
      PLATFORM_OIDC_ALLOWED_ACR_VALUES: 'urn:example:mfa',
    };
    expect(
      validateEnv({
        ...base,
        DATABASE_URL: 'postgresql://user:secret@db.example.test:5432/cafe_os',
        NODE_ENV: 'production',
        ...platformOidc,
      }),
    ).toEqual(expect.objectContaining(platformOidc));
    expect(() =>
      validateEnv({
        ...base,
        DATABASE_URL: 'postgresql://user:secret@db.example.test:5432/cafe_os',
        NODE_ENV: 'production',
        ...platformOidc,
        PLATFORM_OIDC_STATE_HMAC_SECRET: base.JWT_SECRET,
      }),
    ).toThrow(/must be distinct from JWT_SECRET/);
    expect(() =>
      validateEnv({
        ...base,
        DATABASE_URL: 'postgresql://user:secret@db.example.test:5432/cafe_os',
        NODE_ENV: 'production',
        ...platformOidc,
        PLATFORM_OIDC_ISSUER: 'http://identity.example.test',
      }),
    ).toThrow(/must use HTTPS in production/);

    expect(() =>
      validateEnv({
        ...base,
        DATABASE_URL: 'postgresql://user:secret@db.example.test:5432/cafe_os',
        NODE_ENV: 'production',
        ...platformOidc,
        PLATFORM_OIDC_ISSUER: 'https://identity.example.test',
      }),
    ).toThrow(/must be a Keycloak realm URL/);
  });

  it('requires production PostgreSQL to target the configured cafe_os database', () => {
    const production = {
      DATABASE_URL: 'postgresql://user:secret@db.example.test:5432/cafe_os',
      JWT_SECRET: base.JWT_SECRET,
      NODE_ENV: 'production',
      PLATFORM_OIDC_ISSUER: 'https://identity.example.test/realms/erp',
      PLATFORM_OIDC_CLIENT_ID: 'platform-client',
      PLATFORM_OIDC_CLIENT_SECRET: 'client-secret',
      PLATFORM_OIDC_CALLBACK_URL:
        'https://api.example.test/auth/platform/oidc/callback',
      PLATFORM_OIDC_FRONTEND_CALLBACK_URL:
        'https://app.example.test/platform/auth/callback',
      PLATFORM_OIDC_STATE_HMAC_SECRET:
        'state-hmac-secret-long-enough-for-production',
      PLATFORM_OIDC_ALLOWED_ACR_VALUES: 'urn:example:mfa',
    };

    expect(() => validateEnv(production)).not.toThrow();
    expect(() =>
      validateEnv({
        ...production,
        DATABASE_URL: 'postgresql://user:secret@db.example.test:5432/other',
      }),
    ).toThrow(/must target PostgreSQL database cafe_os/);
    expect(() =>
      validateEnv({
        ...production,
        DATABASE_URL: 'mysql://user:secret@db.example.test:3306/cafe_os',
      }),
    ).toThrow(/must target PostgreSQL database cafe_os/);
  });

  it('rejects partially configured OIDC policies outside production', () => {
    expect(() =>
      validateEnv({
        ...base,
        PLATFORM_OIDC_ISSUER: 'https://identity.example.test/realms/erp',
      }),
    ).toThrow(/must be configured together/);
  });
});
