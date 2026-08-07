import { Module } from '@nestjs/common';

import { DomainEventsModule } from '../../../core/events/domain-events.module';

import { WebsocketModule } from '../websocket.module';

import { RealtimeEventEmitter } from './realtime-event-emitter';
import { RealtimeEventsSubscriber } from './realtime-events.subscriber';

@Module({
  imports: [DomainEventsModule, WebsocketModule],
  providers: [RealtimeEventEmitter, RealtimeEventsSubscriber],
  exports: [],
})
export class RealtimeEventsModule {}
