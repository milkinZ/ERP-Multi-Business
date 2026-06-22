import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validateEnv } from './env.validation';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (env) => {
        // validateEnv uses zod and throws on invalid config
        return validateEnv(env as Record<string, unknown>);
      },
    }),
  ],
  exports: [NestConfigModule],
})
export class AppConfigModule {}
