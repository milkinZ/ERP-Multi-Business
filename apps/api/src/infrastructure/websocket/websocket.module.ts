import { Module } from '@nestjs/common';

import { WebsocketGateway } from './gateways/websocket.gateway';
import { WebsocketService } from './websocket.service';
import { WebsocketJwtGuard } from './guards/websocket-jwt.guard';

import { RedisModule } from '../redis/redis.module';
import { RealtimeEventsModule } from './realtime/realtime-events.module';

@Module({
  imports: [RedisModule, RealtimeEventsModule],
  providers: [WebsocketGateway, WebsocketService, WebsocketJwtGuard],
  exports: [WebsocketService],
})
export class WebsocketModule {}
