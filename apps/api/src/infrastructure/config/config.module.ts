import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validateEnv } from './env.validation';
import { appConfig } from './app.config';
import { databaseConfig } from './database.config';
import { redisConfig } from './redis.config';
import { jwtConfig } from './jwt.config';
import { storageConfig } from './storage.config';
import { observabilityConfig } from './observability.config';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (env) => {
        // validateEnv uses zod and throws on invalid config
        return validateEnv(env as Record<string, unknown>);
      },
      load: [
        appConfig,
        databaseConfig,
        redisConfig,
        jwtConfig,
        storageConfig,
        observabilityConfig,
      ],
    }),
  ],
  exports: [NestConfigModule],
})
export class AppConfigModule {}
