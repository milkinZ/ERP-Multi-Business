import { Injectable, Logger } from '@nestjs/common';

import { DomainEvent, DOMAIN_EVENTS } from './domain-events';
import { DomainEventBus } from './domain-event-bus.service';
import { PrismaService } from '../database/prisma.service';
import { MetricsService } from '../../infrastructure/observability/metrics/metrics.service';

const isDomainEventName = (value: unknown): value is DomainEvent['type'] => {
  const types = Object.values(DOMAIN_EVENTS);
  return (
    typeof value === 'string' && types.includes(value as DomainEvent['type'])
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isDomainEvent = (value: unknown): value is DomainEvent => {
  if (!isRecord(value)) return false;

  const type = value.type;
  const payload = value.payload;

  return isDomainEventName(type) && isRecord(payload);
};

@Injectable()
export class OutboxDispatcherService {
  private readonly logger = new Logger(OutboxDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: DomainEventBus,
    private readonly metrics?: MetricsService,
  ) {}

  // Skeleton: Phase 4 requires Outbox entity + no direct controller publish.
  // Dispatcher wiring to background jobs is implemented in later phases.
  async dispatchBatch(limit = 50): Promise<void> {
    // Update backlog metric before processing
    try {
      const backlog = await this.prisma.outboxEvent.count({
        where: { status: 'PENDING' },
      });
      try {
        this.metrics?.outboxBacklog?.set(backlog);
      } catch {
        // ignore metric errors
      }
    } catch {
      // ignore count errors
    }

    const events = await this.prisma.outboxEvent.findMany({
      where: { status: 'PENDING' },
      take: limit,
      orderBy: { createdAt: 'asc' },
    });

    for (const outbox of events) {
      try {
        const raw = outbox.payload;
        let parsed: unknown = raw;

        if (typeof raw === 'string') {
          parsed = JSON.parse(raw);
        }

        if (!isDomainEvent(parsed)) {
          throw new Error('Invalid domain event payload in outbox');
        }

        // Start an OpenTelemetry span if available
        type OtelSpanLike = {
          end?: () => void;
          recordException?: (e: unknown) => void;
          setStatus?: (s: unknown) => void;
        };
        type OtelTracerApi = {
          trace?: {
            getTracer?: (name: string) => {
              startSpan: (name: string, options?: unknown) => OtelSpanLike;
            };
          };
        };

        const tracerApi = (() => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            return require('@opentelemetry/api') as unknown as OtelTracerApi;
          } catch {
            return undefined;
          }
        })();

        let span: OtelSpanLike | null = null;
        try {
          const tracer = tracerApi?.trace?.getTracer?.('erp-api-outbox');
          if (tracer && typeof tracer.startSpan === 'function') {
            span = tracer.startSpan('outbox.dispatch', {
              attributes: { 'outbox.event.type': parsed.type },
            });
          }
        } catch {
          span = null;
        }

        try {
          await this.eventBus.publish(parsed);
          try {
            this.metrics?.domainEventsPublished?.inc({ event: parsed.type }, 1);
          } catch {
            // ignore
          }

          await this.prisma.outboxEvent.update({
            where: { id: outbox.id },
            data: { status: 'PROCESSED', processedAt: new Date() },
          });
        } finally {
          try {
            span?.end?.();
          } catch {
            // ignore
          }
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Unknown outbox dispatch error';

        this.logger.error(`Outbox dispatch failed: ${message}`);

        try {
          this.metrics?.domainEventsFailed?.inc({ event: outbox.type }, 1);
        } catch {
          // ignore
        }

        await this.prisma.outboxEvent.update({
          where: { id: outbox.id },
          data: {
            status: 'FAILED',
            error: message,
          },
        });
      }
    }
  }
}
