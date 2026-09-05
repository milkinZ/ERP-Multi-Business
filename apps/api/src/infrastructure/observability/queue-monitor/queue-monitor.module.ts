import { Module } from '@nestjs/common';

import { QueueModule } from '../../queue/queue.module';

import { MetricsModule } from '../metrics/metrics.module';

import { QueueMonitorService } from './queue-monitor.service';
import { QueueMonitorController } from './queue-monitor.controller';

@Module({
  imports: [QueueModule, MetricsModule],
  providers: [QueueMonitorService],
  controllers: [QueueMonitorController],
  exports: [QueueMonitorService],
})
export class QueueMonitorModule {}
