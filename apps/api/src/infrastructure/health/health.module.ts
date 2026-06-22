import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';

import { RedisModule } from '../redis/redis.module';
import { QueueModule } from '../queue/queue.module';
import { HealthCheck } from '../redis/redis.health-indicator';

@Module({
  imports: [RedisModule, QueueModule, TerminusModule],
  controllers: [HealthController],
  providers: [HealthService, HealthCheck],
})
export class HealthModule {}
