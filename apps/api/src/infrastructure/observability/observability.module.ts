import { Module } from '@nestjs/common';

import { MetricsModule } from './metrics/metrics.module';
import { TracingModule } from './tracing/tracing.module';
import { ErrorTrackingModule } from './error-tracking/error-tracking.module';
import { AlertingModule } from './alerting/alerting.module';
import { DomainEventObservabilityModule } from './domain-event-observability/domain-event-observability.module';
import { WorkerObservabilityModule } from './worker-observability/worker-observability.module';
import { QueueMonitorModule } from './queue-monitor/queue-monitor.module';
import { OpenTelemetryModule } from './opentelemetry/opentelemetry.module';
import { BullBoardModule } from './bull-board/bull-board.module';
import { AdminModule } from './admin/admin.module';
import { PerformanceMonitorInterceptor } from './performance/performance-monitor.interceptor';

@Module({
  imports: [
    MetricsModule,
    TracingModule,
    ErrorTrackingModule,
    AlertingModule,
    DomainEventObservabilityModule,
    WorkerObservabilityModule,
    QueueMonitorModule,
    OpenTelemetryModule,
    BullBoardModule,
    AdminModule,
  ],
  providers: [PerformanceMonitorInterceptor],
})
export class ObservabilityModule {}
