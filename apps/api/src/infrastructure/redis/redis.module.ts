import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { TerminusModule } from '@nestjs/terminus';

import { REDIS_PROVIDER } from './redis.constants';
import { RedisService } from './redis.service';
import { HealthCheck } from './redis.health-indicator';
import { MetricsModule } from '../observability/metrics/metrics.module';

@Global()
@Module({
  imports: [TerminusModule, MetricsModule],
  providers: [
    {
      provide: REDIS_PROVIDER,
      useFactory: (configService: ConfigService) => {
        const enabled = configService.get<boolean>('redis.enabled') ?? false;
        const url = configService.get<string>('redis.url');

        if (!enabled || !url) {
          return new Redis('redis://localhost:6379', { lazyConnect: true });
        }

        return new Redis(url, {
          maxRetriesPerRequest: null,
          enableReadyCheck: true,
        });
      },
      inject: [ConfigService],
    },
    RedisService,
    HealthCheck,
  ],
  exports: [RedisService],
})
export class RedisModule {}
