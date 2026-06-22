import { Injectable, Logger } from '@nestjs/common';

import { DomainEvent, DOMAIN_EVENTS } from './domain-events';
import { DomainEventBus } from './domain-event-bus.service';
import { PrismaService } from '../database/prisma.service';

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
  ) {}

  // Skeleton: Phase 4 requires Outbox entity + no direct controller publish.
  // Dispatcher wiring to background jobs is implemented in later phases.
  async dispatchBatch(limit = 50): Promise<void> {
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

        await this.eventBus.publish(parsed);

        await this.prisma.outboxEvent.update({
          where: { id: outbox.id },
          data: { status: 'PROCESSED', processedAt: new Date() },
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Unknown outbox dispatch error';

        this.logger.error(`Outbox dispatch failed: ${message}`);

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
