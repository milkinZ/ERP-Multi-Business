import { Injectable, OnModuleInit } from '@nestjs/common';

import { DomainEventBus } from '../../../core/events/domain-event-bus.service';
import type { DomainEvent } from '../../../core/events/domain-events';

import { WebsocketService } from '../websocket.service';
import { RealtimeEventEmitter } from './realtime-event-emitter';

import {
  getRealtimeEventRooms,
  toRealtimeRoomRouting,
} from './realtime-event-routing';

import { RealtimeEventPayloadDto as BaseRealtimeEventPayloadDto } from './dto/realtime-event-payload.dto';

import { RealtimeDomainEventsSubscription } from './realtime-domain-events-subscription';

@Injectable()
export class RealtimeEventsSubscriber implements OnModuleInit {
  constructor(
    private readonly domainEventBus: DomainEventBus,
    // Keep websocketService injected only to ensure websocket stack is bootstrapped.
    private readonly websocketService: WebsocketService,
    private readonly realtimeEmitter: RealtimeEventEmitter,
  ) {}

  onModuleInit() {
    const subscription = new RealtimeDomainEventsSubscription({
      bus: this.domainEventBus,
      onEvent: (event) => this.handleDomainEvent(event),
    });

    subscription.subscribe();
  }

  private handleDomainEvent(event: DomainEvent) {
    // Route based on payload shape.
    const routing = toRealtimeRoomRouting(event.type, event.payload);

    const rooms = getRealtimeEventRooms(routing);
    if (rooms.length === 0) return;

    // DTO-only payload.
    const dto: BaseRealtimeEventPayloadDto<Record<string, unknown>> = {
      type: event.type,
      data: {
        ...event.payload,
      },
      occurredAt: (event.occurredAt ?? new Date()).toISOString(),
    };

    this.realtimeEmitter.emitToRooms(event.type, dto, rooms);
  }
}
