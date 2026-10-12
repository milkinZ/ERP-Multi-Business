import { Injectable, Logger } from '@nestjs/common';

import { DomainEvent, DOMAIN_EVENTS } from './domain-events';
import { DomainEventBus } from './domain-event-bus.service';
import { PrismaService } from '../database/prisma.service';
import { MetricsService } from '../../infrastructure/observability/metrics/metrics.service';
import { requestContext } from '../request-context/request-context';

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

const normalizeDomainEvent = (value: unknown): DomainEvent => {
  if (!isDomainEvent(value)) {
    throw new Error('Invalid domain event payload in outbox');
  }

  const occurredAt = value.occurredAt;
  if (occurredAt === undefined || occurredAt instanceof Date) {
    if (occurredAt instanceof Date && Number.isNaN(occurredAt.getTime())) {
      throw new Error('Invalid domain event occurredAt in outbox');
    }
    return value;
  }

  if (typeof occurredAt !== 'string') {
    throw new Error('Invalid domain event occurredAt in outbox');
  }

  const normalizedOccurredAt = new Date(occurredAt);
  if (Number.isNaN(normalizedOccurredAt.getTime())) {
    throw new Error('Invalid domain event occurredAt in outbox');
  }

  return { ...value, occurredAt: normalizedOccurredAt };
};

const getEventTenantId = (event: DomainEvent): string | undefined => {
  const tenantId = event.payload.tenantId;
  return typeof tenantId === 'string' && tenantId.length > 0
    ? tenantId
    : undefined;
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

        const event = normalizeDomainEvent(parsed);

        const tenantId = outbox.tenantId ?? getEventTenantId(event);
        if (!tenantId) {
          throw new Error('OUTBOX_TENANT_CONTEXT_MISSING');
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
              attributes: { 'outbox.event.type': event.type },
            });
          }
        } catch {
          span = null;
        }

        try {
          const systemContext = requestContext.get();
          await requestContext.run(
            {
              ...systemContext,
              tenantId,
              outletId: outbox.outletId,
            },
            async () => {
              await this.eventBus.publish(event);

              await this.prisma.outboxEvent.update({
                where: { id: outbox.id },
                data: { status: 'PROCESSED', processedAt: new Date() },
              });
            },
          );
          try {
            this.metrics?.domainEventsPublished?.inc({ event: event.type }, 1);
          } catch {
            // ignore
          }
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
