import { createHash } from 'node:crypto';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import type { DomainEvent } from '../../core/events/domain-events';
import { DomainEventBus } from '../../core/events/domain-event-bus.service';
import { requestContext } from '../../core/request-context/request-context';
import { NotificationService } from './notification.service';
import {
  resolveNotificationRoute,
  toDomainEventNotification,
} from './notification-routing';

@Injectable()
export class NotificationEventSubscriber
  implements OnModuleInit, OnModuleDestroy
{
  private unsubscribe?: () => boolean;

  constructor(
    private readonly eventBus: DomainEventBus,
    private readonly notificationService: NotificationService,
  ) {}

  onModuleInit() {
    this.unsubscribe = this.eventBus.subscribeAll((event) =>
      this.handleEvent(event),
    );
  }

  onModuleDestroy() {
    this.unsubscribe?.();
  }

  private async handleEvent(event: DomainEvent) {
    const route = resolveNotificationRoute(event);
    if (!route) return;

    const payload = event.payload as Record<string, unknown>;
    const tenantId =
      typeof payload.tenantId === 'string'
        ? payload.tenantId
        : requestContext.get().tenantId;
    if (!tenantId) {
      throw new Error(
        `Tenant context is required to notify for domain event ${event.type}`,
      );
    }

    const outletId = Object.hasOwn(payload, 'outletId')
      ? typeof payload.outletId === 'string'
        ? payload.outletId
        : undefined
      : (requestContext.get().outletId ?? undefined);
    const sourceEventId =
      event.eventId ??
      createHash('sha256')
        .update(
          `${event.type}:${event.occurredAt?.toISOString() ?? ''}:${JSON.stringify(payload)}`,
        )
        .digest('hex');
    const notification = toDomainEventNotification(event, route.category);

    await this.notificationService.dispatchToAuthorizedRecipients({
      tenantId,
      outletId,
      sourceEventId,
      requiredPermission: route.requiredPermission,
      ...notification,
    });
  }
}
