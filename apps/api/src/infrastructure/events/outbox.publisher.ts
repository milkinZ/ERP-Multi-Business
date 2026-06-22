import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import { DomainEvent } from '../../core/events/domain-events';

@Injectable()
export class OutboxPublisher {
  constructor(private readonly prisma: PrismaService) {}

  async publish(event: DomainEvent) {
    // Phase 4 rule: No event should be published directly from controllers.
    // Controllers (and later services) should call this publisher.
    await this.prisma.outboxEvent.create({
      data: {
        type: event.type,
        payload: JSON.stringify({
          ...event,
          occurredAt: event.occurredAt ?? new Date(),
        }),
        status: 'PENDING',
      },
    });
  }
}
