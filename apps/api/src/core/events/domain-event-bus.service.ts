import { Injectable } from '@nestjs/common';

import { DomainEvent, DomainEventName } from './domain-events';

type DomainEventHandler<TEvent extends DomainEvent = DomainEvent> = (
  event: TEvent,
) => Promise<void> | void;

@Injectable()
export class DomainEventBus {
  private readonly handlers = new Map<
    DomainEventName,
    Set<DomainEventHandler>
  >();

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

  async publish(event: DomainEvent) {
    const handlers = [...(this.handlers.get(event.type) ?? [])];

    for (const handler of handlers) {
      await handler({
        ...event,
        occurredAt: event.occurredAt ?? new Date(),
      });
    }
  }
}
