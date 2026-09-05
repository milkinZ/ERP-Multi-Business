import { forwardRef, Module } from '@nestjs/common';

import { DomainEventsModule } from '../../../core/events/domain-events.module';
import { MetricsModule } from '../../observability/metrics/metrics.module';

import { WebsocketModule } from '../websocket.module';

import { RealtimeEventEmitter } from './realtime-event-emitter';
import { RealtimeEventsSubscriber } from './realtime-events.subscriber';

@Module({
  imports: [
    DomainEventsModule,
    MetricsModule,
    forwardRef(() => WebsocketModule),
  ],
  providers: [RealtimeEventEmitter, RealtimeEventsSubscriber],
  exports: [],
})
export class RealtimeEventsModule {}
