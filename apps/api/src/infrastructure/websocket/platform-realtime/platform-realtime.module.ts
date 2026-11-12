import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from '../../../core/database/prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { PlatformOperationsRealtimeGateway } from './platform-operations-realtime.gateway';
import { PlatformOperationsRealtimeService } from './platform-operations-realtime.service';

@Module({
  imports: [ConfigModule, PrismaModule, RedisModule],
  providers: [
    PlatformOperationsRealtimeGateway,
    PlatformOperationsRealtimeService,
  ],
  exports: [
    PlatformOperationsRealtimeGateway,
    PlatformOperationsRealtimeService,
  ],
})
export class PlatformRealtimeModule {}
