import { Module } from '@nestjs/common';

import { FeatureFlagController } from './feature-flag.controller';
import { FeatureFlagService } from './feature-flag.service';
import { FeatureFlagRepository } from './feature-flag.repository';
import { DomainEventsModule } from '../../core/events/domain-events.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { FeatureModuleGuard } from './feature-module.guard';

@Module({
  imports: [DomainEventsModule, RedisModule, SubscriptionModule],
  controllers: [FeatureFlagController],
  providers: [FeatureFlagService, FeatureFlagRepository, FeatureModuleGuard],
  exports: [
    FeatureFlagService,
    FeatureFlagRepository,
    FeatureModuleGuard,
    SubscriptionModule,
  ],
})
export class FeatureFlagsModule {}
