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
    const eventPayload = event.payload as Record<string, unknown>;
    const tenantId =
      ctx.tenantId ??
      (typeof eventPayload.tenantId === 'string'
        ? eventPayload.tenantId
        : undefined);
    if (!tenantId) {
      throw new Error('OUTBOX_TENANT_CONTEXT_MISSING');
    }

    await client.outboxEvent.create({
      data: {
        tenantId,
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
