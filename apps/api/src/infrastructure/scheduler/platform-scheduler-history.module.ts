import { Module } from '@nestjs/common';

import { PrismaModule } from '../../core/database/prisma.module';
import { PlatformRealtimeModule } from '../websocket/platform-realtime/platform-realtime.module';
import { PlatformSchedulerExecutionService } from './platform-scheduler-execution.service';

@Module({
  imports: [PrismaModule, PlatformRealtimeModule],
  providers: [PlatformSchedulerExecutionService],
  exports: [PlatformSchedulerExecutionService],
})
export class PlatformSchedulerHistoryModule {}
