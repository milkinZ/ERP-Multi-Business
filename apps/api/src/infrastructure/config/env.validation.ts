import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().optional(),

    // Required for all environments (including test) per Phase 1 strict validation.
    DATABASE_URL: z.string().min(1),

    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN_ACCESS: z.string().optional(),

    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    SMTP_SECURE: z.enum(['true', 'false']).optional(),
    EMAIL_FROM: z.string().email().optional(),
    WEB_BASE_URL: z.string().url().default('http://localhost:3000'),

    PLATFORM_OIDC_ISSUER: z.string().url().optional(),
    PLATFORM_OIDC_CLIENT_ID: z.string().min(1).optional(),
    PLATFORM_OIDC_CLIENT_SECRET: z.string().min(1).optional(),
    PLATFORM_OIDC_CALLBACK_URL: z.string().url().optional(),
    PLATFORM_OIDC_FRONTEND_CALLBACK_URL: z.string().url().optional(),
    PLATFORM_OIDC_STATE_HMAC_SECRET: z.string().min(32).optional(),
    PLATFORM_OIDC_ALLOWED_ACR_VALUES: z.string().min(1).optional(),

    CORS_ORIGIN: z.string().default('http://localhost:3000'),

    APP_VERSION: z.string().default('1'),

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    // Xendit payment provider boundary (optional until the provider is configured)
    XENDIT_API_KEY: z.string().optional(),
    XENDIT_API_BASE_URL: z.string().url().optional(),
    XENDIT_WEBHOOK_TOKEN: z.string().optional(),

    // Observability (optional, non-blocking)
    METRICS_ENABLED: z.enum(['true', 'false']).default('true'),
    METRICS_PATH: z.string().default('/metrics'),

    TRACE_ENABLED: z.enum(['true', 'false']).default('false'),
    TRACE_SAMPLING_RATE: z.coerce.number().min(0).max(1).optional(),
    TRACE_EXPORTER: z.string().default('console'),

    SENTRY_DSN: z.string().optional(),
    SENTRY_ENVIRONMENT: z.string().optional(),
    SENTRY_RELEASE: z.string().optional(),

    ALERTING_ENABLED: z.enum(['true', 'false']).default('false'),
    ALERT_WEBHOOK_URL: z.string().optional(),
    ALERT_HIGH_ERROR_RATE_THRESHOLD: z.coerce.number().optional(),
    ALERT_HIGH_RESPONSE_TIME_MS: z.coerce.number().optional(),
    ALERT_QUEUE_BACKLOG_THRESHOLD: z.coerce.number().optional(),
    ALERT_OUTBOX_STUCK_THRESHOLD: z.coerce.number().optional(),

    LOG_RETENTION_DURATION_DAYS: z.coerce.number().default(30),
    LOG_ROTATION_PERIOD: z.string().default('daily'),
    LOG_COMPRESSION: z.string().default('gzip'),
    LOG_PATH: z.string().optional(),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === 'production') {
      for (const key of ['SMTP_HOST', 'SMTP_PORT', 'EMAIL_FROM'] as const) {
        if (!env[key]) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${key} must be configured in production.`,
            path: [key],
          });
        }
      }
    }

    if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SMTP_USER and SMTP_PASSWORD must be configured together.',
        path: ['SMTP_USER'],
      });
    }

    if (env.NODE_ENV === 'production') {
      let databaseUrl: URL | undefined;
      try {
        databaseUrl = new URL(env.DATABASE_URL);
      } catch {
        databaseUrl = undefined;
      }

      if (
        !databaseUrl ||
        !['postgres:', 'postgresql:'].includes(databaseUrl.protocol) ||
        databaseUrl.pathname !== '/cafe_os'
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Production DATABASE_URL must target PostgreSQL database cafe_os.',
          path: ['DATABASE_URL'],
        });
      }
    }

    const oidcSettings = [
      env.PLATFORM_OIDC_ISSUER,
      env.PLATFORM_OIDC_CLIENT_ID,
      env.PLATFORM_OIDC_CLIENT_SECRET,
      env.PLATFORM_OIDC_CALLBACK_URL,
      env.PLATFORM_OIDC_FRONTEND_CALLBACK_URL,
      env.PLATFORM_OIDC_STATE_HMAC_SECRET,
      env.PLATFORM_OIDC_ALLOWED_ACR_VALUES,
    ];
    const configuredSettings = oidcSettings.filter(Boolean).length;

    if (configuredSettings > 0 && configuredSettings !== oidcSettings.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Platform OIDC settings must be configured together.',
        path: ['PLATFORM_OIDC_ISSUER'],
      });
    }

    if (
      env.NODE_ENV === 'production' &&
      configuredSettings !== oidcSettings.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Platform OIDC must be fully configured in production.',
        path: ['PLATFORM_OIDC_ISSUER'],
      });
    }

    if (configuredSettings === oidcSettings.length) {
      for (const key of [
        'PLATFORM_OIDC_ISSUER',
        'PLATFORM_OIDC_CALLBACK_URL',
        'PLATFORM_OIDC_FRONTEND_CALLBACK_URL',
      ] as const) {
        const value = env[key];
        if (
          env.NODE_ENV === 'production' &&
          value &&
          !value.startsWith('https://')
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${key} must use HTTPS in production.`,
            path: [key],
          });
        }
      }

      const acrValues = env.PLATFORM_OIDC_ALLOWED_ACR_VALUES?.split(',').map(
        (value) => value.trim(),
      );
      if (!acrValues?.length || acrValues.some((value) => value.length === 0)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'At least one non-empty platform MFA ACR value is required.',
          path: ['PLATFORM_OIDC_ALLOWED_ACR_VALUES'],
        });
      }

      if (env.PLATFORM_OIDC_STATE_HMAC_SECRET === env.JWT_SECRET) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'PLATFORM_OIDC_STATE_HMAC_SECRET must be distinct from JWT_SECRET.',
          path: ['PLATFORM_OIDC_STATE_HMAC_SECRET'],
        });
      }

      if (env.NODE_ENV === 'production' && env.PLATFORM_OIDC_ISSUER) {
        const issuerUrl = new URL(env.PLATFORM_OIDC_ISSUER);
        const issuerPath = issuerUrl.pathname.replace(/\/+$/, '');
        if (
          issuerUrl.search ||
          issuerUrl.hash ||
          !/(?:^|\/)realms\/[^/]+$/.test(issuerPath)
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'PLATFORM_OIDC_ISSUER must be a Keycloak realm URL ending in /realms/<realm>.',
            path: ['PLATFORM_OIDC_ISSUER'],
          });
        }
      }
    }
  });

export type EnvVars = z.infer<typeof envSchema>;

export function validateEnv(env: Record<string, unknown>): EnvVars {
  return envSchema.parse(env);
}
