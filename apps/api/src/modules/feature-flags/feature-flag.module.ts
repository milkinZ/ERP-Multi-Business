import { Module } from '@nestjs/common';

import { FeatureFlagController } from './feature-flag.controller';
import { FeatureFlagService } from './feature-flag.service';
import { FeatureFlagRepository } from './feature-flag.repository';
import { DomainEventsModule } from '../../core/events/domain-events.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';

@Module({
  imports: [DomainEventsModule, RedisModule],
  controllers: [FeatureFlagController],
  providers: [FeatureFlagService, FeatureFlagRepository],
  exports: [FeatureFlagService, FeatureFlagRepository],
})
export class FeatureFlagsModule {}
