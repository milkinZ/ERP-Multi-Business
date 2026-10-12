import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { DomainEvent } from '../../core/events/domain-events';
import { requestContext } from '../../core/request-context/request-context';

@Injectable()
export class OutboxPublisher {
  constructor(private readonly prisma: PrismaService) {}

  async publish(
    event: DomainEvent,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const ctx = requestContext.get();
    await client.outboxEvent.create({
      data: {
        tenantId: ctx.tenantId,
        outletId: ctx.outletId ?? null,
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
