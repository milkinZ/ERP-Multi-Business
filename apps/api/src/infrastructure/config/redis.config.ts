import { registerAs } from '@nestjs/config';

export const redisConfig = registerAs('redis', () => ({
  enabled: process.env.REDIS_ENABLED === 'true',
  url: process.env.REDIS_URL,
}));
