import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import { DomainEvent } from '../../core/events/domain-events';
import { requestContext } from '../../core/request-context/request-context';

@Injectable()
export class OutboxPublisher {
  constructor(private readonly prisma: PrismaService) {}

  async publish(event: DomainEvent) {
    const ctx = requestContext.get();
    await this.prisma.outboxEvent.create({
      data: {
        type: event.type,
        payload: JSON.stringify({
          ...event,
          occurredAt: event.occurredAt ?? new Date(),
          _observability: ctx,
        }),
        status: 'PENDING',
      },
    });
  }
}
