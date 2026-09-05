import { Module } from '@nestjs/common';

import { MetricsModule } from '../metrics/metrics.module';

import { WorkerObservabilityService } from './worker-observability.service';

@Module({
  imports: [MetricsModule],
  providers: [WorkerObservabilityService],
  exports: [WorkerObservabilityService],
})
export class WorkerObservabilityModule {}
