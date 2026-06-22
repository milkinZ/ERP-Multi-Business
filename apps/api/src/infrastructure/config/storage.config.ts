import { registerAs } from '@nestjs/config';

export const storageConfig = registerAs('storage', () => ({
  provider: process.env.STORAGE_PROVIDER ?? 'local',
}));
