import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { DomainEventBus } from '../../../core/events/domain-event-bus.service';
import {
  DOMAIN_EVENTS,
  type DomainEvent,
  type DomainEventName,
} from '../../../core/events/domain-events';

import { MetricsService } from '../metrics/metrics.service';

import { AlertingService } from '../alerting/alerting.service';

/**
 * Domain-event observability subscriber.
 *
 * This is a NON-BLOCKING observer of published domain events.
 * It feeds metrics only; it never executes business logic and never throws.
 */
@Injectable()
export class DomainEventObservabilityService implements OnModuleInit {
  private readonly logger = new Logger(DomainEventObservabilityService.name);

  constructor(
    private readonly domainEventBus: DomainEventBus,
    private readonly metrics: MetricsService,
    private readonly alerting: AlertingService,
  ) {}

  onModuleInit() {
    const eventNames = Object.values(DOMAIN_EVENTS) as DomainEventName[];
    for (const name of eventNames) {
      this.domainEventBus.subscribe<DomainEvent>(
        name as DomainEvent['type'],
        (event) => {
          this.observe(event);
        },
      );
    }
    this.logger.log(
      `Domain-event observability subscribed to ${eventNames.length} events`,
    );
  }

  /** Observe a single domain event. */
  observe(event: DomainEvent): void {
    try {
      this.metrics.domainEventsPublished.inc({ event: event.type });
      this.metrics.domainEventsProcessed.inc({ event: event.type });
      this.metrics.domainEventsSucceeded.inc({ event: event.type });
    } catch {
      // Ignore.
    }
  }

  /** Record a domain event failure signal. */
  recordFailure(eventType: string): void {
    try {
      this.metrics.domainEventsFailed.inc({ event: eventType });
      this.alerting.recordError('domain_event', eventType);
    } catch {
      // Ignore.
    }
  }
}
