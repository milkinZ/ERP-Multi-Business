import { Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { MetricsModule } from '../observability/metrics/metrics.module';

@Module({
  imports: [MetricsModule],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
