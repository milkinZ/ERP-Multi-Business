import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().optional(),

  // Required for all environments (including test) per Phase 1 strict validation.
  DATABASE_URL: z.string().min(1),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN_ACCESS: z.string().optional(),

  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  APP_VERSION: z.string().default('1'),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

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
});

export type EnvVars = z.infer<typeof envSchema>;

export function validateEnv(env: Record<string, unknown>): EnvVars {
  return envSchema.parse(env);
}
