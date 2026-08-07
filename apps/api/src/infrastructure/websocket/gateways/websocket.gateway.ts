import {
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  UseGuards,
} from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import type { Server, Socket } from 'socket.io';

import {
  WebsocketService,
  type AuthenticatedSocketContext,
} from '../websocket.service';
import { WebsocketJwtGuard } from '../guards/websocket-jwt.guard';
import { SocketRedisAdapterProvider } from '../redis/socket-redis-adapter.provider';

@WebSocketGateway({
  namespace: '/ws',
  cors: {
    origin: '*',
    credentials: true,
  },
  transports: ['websocket'],
  serveClient: false,
})
@UseGuards(WebsocketJwtGuard)
export class WebsocketGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(WebsocketGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly websocketService: WebsocketService,
    private readonly socketRedisAdapterProvider: SocketRedisAdapterProvider,
  ) {}

  async onModuleInit() {
    const { createAdapter, pubClient, subClient } =
      await this.socketRedisAdapterProvider.createAdapter();

    // Adapter package typings can be incompatible with our Redis client types.
    // Assign through unknown to satisfy strict TS checks without changing runtime.
    const adapter = createAdapter(pubClient, subClient);
    this.server.adapter(adapter as Parameters<Server['adapter']>[0]);

    this.logger.log('Socket.IO Redis adapter initialized');
  }

  async handleConnection(client: Socket) {
    const ctx = (
      client.data as { ctx?: AuthenticatedSocketContext } | undefined
    )?.ctx;

    if (!ctx?.userId || !ctx?.tenantId) {
      client.disconnect(true);
      return;
    }

    await this.websocketService.joinTenantRoom(client, ctx.tenantId);
    await this.websocketService.joinOutletRoom(client, ctx.outletId);
    await this.websocketService.joinUserRoom(client, ctx.userId);

    client.once('disconnect', () => {
      this.websocketService.leaveAllRooms(client).catch(() => undefined);
    });

    this.logger.debug(`WS connected user=${ctx.userId} tenant=${ctx.tenantId}`);
  }

  async handleDisconnect(client: Socket) {
    await this.websocketService.leaveAllRooms(client).catch(() => undefined);
    this.logger.debug(`WS disconnected id=${client.id}`);
  }

  @SubscribeMessage('ping')
  onPing(): { ok: true; t: number } {
    return { ok: true, t: Date.now() };
  }

  async onModuleDestroy() {
    await this.server.close();
  }
}
