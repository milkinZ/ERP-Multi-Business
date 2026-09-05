import { Module } from '@nestjs/common';

import { DomainEventsModule } from '../../../core/events/domain-events.module';

import { MetricsModule } from '../metrics/metrics.module';
import { AlertingModule } from '../alerting/alerting.module';

import { DomainEventObservabilityService } from './domain-event-observability.service';

@Module({
  imports: [DomainEventsModule, MetricsModule, AlertingModule],
  providers: [DomainEventObservabilityService],
  exports: [DomainEventObservabilityService],
})
export class DomainEventObservabilityModule {}
