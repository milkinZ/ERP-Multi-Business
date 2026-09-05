import { forwardRef, Module } from '@nestjs/common';

import { WebsocketGateway } from './gateways/websocket.gateway';
import { WebsocketService } from './websocket.service';
import { WebsocketJwtGuard } from './guards/websocket-jwt.guard';

import { RedisModule } from '../redis/redis.module';
import { RealtimeEventsModule } from './realtime/realtime-events.module';

import { SocketRedisAdapterProvider } from './redis/socket-redis-adapter.provider';
import { MetricsModule } from '../observability/metrics/metrics.module';

@Module({
  imports: [RedisModule, MetricsModule, forwardRef(() => RealtimeEventsModule)],
  providers: [
    WebsocketGateway,
    WebsocketService,
    WebsocketJwtGuard,
    SocketRedisAdapterProvider,
  ],
  exports: [WebsocketService, WebsocketGateway],
})
export class WebsocketModule {}
