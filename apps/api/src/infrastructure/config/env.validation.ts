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
});

export type EnvVars = z.infer<typeof envSchema>;

export function validateEnv(env: Record<string, unknown>): EnvVars {
  return envSchema.parse(env);
}
