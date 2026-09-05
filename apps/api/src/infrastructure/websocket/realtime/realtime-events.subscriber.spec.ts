import { RealtimeEventsSubscriber } from './realtime-events.subscriber';
import { DOMAIN_EVENTS, DomainEvent } from '../../../core/events/domain-events';
import { DomainEventBus } from '../../../core/events/domain-event-bus.service';
import { WebsocketService } from '../websocket.service';
import { RealtimeEventEmitter } from './realtime-event-emitter';

describe('RealtimeEventsSubscriber', () => {
  it('subscribes domain events and emits DTO payloads only to tenant-scoped rooms', () => {
    const subscriptions = new Map<string, (event: DomainEvent) => void>();
    const subscribe = jest.fn(
      (eventName: string, handler: (event: DomainEvent) => void) => {
        subscriptions.set(eventName, handler);
      },
    );
    const emitToRooms = jest.fn();
    const emitter = { emitToRooms } as unknown as RealtimeEventEmitter;
    const subscriber = new RealtimeEventsSubscriber(
      { subscribe } as unknown as DomainEventBus,
      {} as WebsocketService,
      emitter,
    );

    subscriber.onModuleInit();
    const event: DomainEvent = {
      type: DOMAIN_EVENTS.ORDER_CREATED,
      payload: {
        orderId: 'order-a',
        tenantId: 'tenant-a',
        outletId: 'outlet-a',
      },
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    subscriptions.get(DOMAIN_EVENTS.ORDER_CREATED)?.(event);

    expect(emitToRooms).toHaveBeenCalledWith(
      DOMAIN_EVENTS.ORDER_CREATED,
      {
        type: DOMAIN_EVENTS.ORDER_CREATED,
        data: event.payload,
        occurredAt: '2026-01-01T00:00:00.000Z',
      },
      ['tenant:tenant-a', 'outlet:outlet-a'],
    );
  });

  it('drops domain events without tenant context instead of broadcasting globally', () => {
    const subscriptions = new Map<string, (event: DomainEvent) => void>();
    const subscribe = jest.fn(
      (eventName: string, handler: (event: DomainEvent) => void) => {
        subscriptions.set(eventName, handler);
      },
    );
    const emitToRooms = jest.fn();
    const subscriber = new RealtimeEventsSubscriber(
      { subscribe } as unknown as DomainEventBus,
      {} as WebsocketService,
      { emitToRooms } as unknown as RealtimeEventEmitter,
    );
    subscriber.onModuleInit();

    subscriptions.get(DOMAIN_EVENTS.ORDER_CREATED)?.({
      type: DOMAIN_EVENTS.ORDER_CREATED,
      payload: { orderId: 'order-a' },
    } as unknown as DomainEvent);

    expect(emitToRooms).not.toHaveBeenCalled();
  });
});
