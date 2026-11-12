import { Injectable } from '@nestjs/common';

import { DomainEvent, DomainEventName } from './domain-events';
import { requestContext } from '../request-context/request-context';

type DomainEventHandler<TEvent extends DomainEvent = DomainEvent> = (
  event: TEvent,
) => Promise<void> | void;

@Injectable()
export class DomainEventBus {
  private readonly handlers = new Map<
    DomainEventName,
    Set<DomainEventHandler>
  >();
  private readonly allHandlers = new Set<DomainEventHandler>();

  subscribe<TEvent extends DomainEvent>(
    eventName: TEvent['type'],
    handler: DomainEventHandler<TEvent>,
  ) {
    const handlers =
      this.handlers.get(eventName) ?? new Set<DomainEventHandler>();

    handlers.add(handler);
    this.handlers.set(eventName, handlers);

    return () => {
      handlers.delete(handler);
    };
  }

  subscribeAll(handler: DomainEventHandler) {
    this.allHandlers.add(handler);
    return () => this.allHandlers.delete(handler);
  }

  async publish(event: DomainEvent) {
    const handlers = [...(this.handlers.get(event.type) ?? [])];
    handlers.push(...this.allHandlers);
    const ctx = requestContext.get();

    const observabilityContext =
      Object.keys(ctx).length > 0
        ? ctx
        : (event as { _observability?: unknown })._observability;

    for (const handler of handlers) {
      const enriched = {
        ...event,
        occurredAt: event.occurredAt ?? new Date(),
        _observability: observabilityContext,
      } as unknown as DomainEvent;

      await handler(enriched);
    }
  }
}
