import { Logger, UseGuards } from '@nestjs/common';
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
import { MetricsService } from '../../observability/metrics/metrics.service';
import { WebsocketJwtGuard } from '../guards/websocket-jwt.guard';

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
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(WebsocketGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly websocketService: WebsocketService,
    private readonly metrics: MetricsService,
  ) {}

  async handleConnection(client: Socket) {
    // Start a lightweight OTEL span for connection handling
    try {
      type OtelSpanLike = { end?: () => void };
      type OtelTracerApi = {
        trace?: {
          getTracer?: (name: string) => {
            startSpan: (name: string, opts?: unknown) => OtelSpanLike;
          };
        };
      };

      const tracerApi = (() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          return require('@opentelemetry/api') as unknown as OtelTracerApi;
        } catch {
          return undefined;
        }
      })();

      const tracer = tracerApi?.trace?.getTracer?.('erp-api-websocket');
      if (tracer && typeof tracer.startSpan === 'function') {
        try {
          const span = tracer.startSpan('ws.connect', {
            attributes: { id: client.id },
          });
          if (span && typeof span.end === 'function') span.end();
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
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

    // Metrics: increment per-tenant websocket connections
    try {
      this.metrics.websocketConnections.inc({ tenant: ctx.tenantId }, 1);
    } catch {
      // non-blocking
    }

    this.logger.debug(`WS connected user=${ctx.userId} tenant=${ctx.tenantId}`);
  }

  async handleDisconnect(client: Socket) {
    // Trace disconnects as well
    try {
      type OtelSpanLike = { end?: () => void };
      type OtelTracerApi = {
        trace?: {
          getTracer?: (name: string) => {
            startSpan: (name: string, opts?: unknown) => OtelSpanLike;
          };
        };
      };

      const tracerApi = (() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          return require('@opentelemetry/api') as unknown as OtelTracerApi;
        } catch {
          return undefined;
        }
      })();

      const tracer = tracerApi?.trace?.getTracer?.('erp-api-websocket');
      if (tracer && typeof tracer.startSpan === 'function') {
        try {
          const span = tracer.startSpan('ws.disconnect', {
            attributes: { id: client.id },
          });
          if (span && typeof span.end === 'function') span.end();
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
    await this.websocketService.leaveAllRooms(client).catch(() => undefined);
    // Decrement per-tenant websocket connections if present
    const ctx = (
      client.data as { ctx?: AuthenticatedSocketContext } | undefined
    )?.ctx;
    if (ctx?.tenantId) {
      try {
        this.metrics.websocketConnections.dec(
          { tenant: ctx.tenantId, outlet: ctx.outletId ?? '' },
          1,
        );
        this.metrics.websocketDisconnects.inc(
          { tenant: ctx.tenantId, outlet: ctx.outletId ?? '' },
          1,
        );
      } catch {
        // non-blocking
      }
    }

    this.logger.debug(`WS disconnected id=${client.id}`);
  }

  @SubscribeMessage('ping')
  onPing(): { ok: true; t: number } {
    return { ok: true, t: Date.now() };
  }
}
