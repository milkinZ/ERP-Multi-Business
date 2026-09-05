/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

import { WebsocketGateway } from '../gateways/websocket.gateway';
import { MetricsService } from '../../observability/metrics/metrics.service';

type ServerLike = Pick<Server, 'to'> & {
  to: (room: string) => {
    emit: (event: string, data: unknown) => void;
  };
};

@Injectable()
export class RealtimeEventEmitter {
  private readonly logger = new Logger(RealtimeEventEmitter.name);

  constructor(
    private readonly websocketGateway: WebsocketGateway,
    private readonly metrics: MetricsService,
  ) {}

  emitToRooms(eventName: string, payload: unknown, rooms: string[]) {
    const server = (
      this.websocketGateway as unknown as {
        server?: ServerLike;
      }
    ).server;

    if (!server) return;

    for (const room of rooms) {
      try {
        const tracerApi = (() => {
          try {
            return require('@opentelemetry/api');
          } catch {
            return null;
          }
        })();

        const start = Date.now();
        let span: any = null;
        try {
          if (tracerApi) {
            const tracer = tracerApi.trace.getTracer('erp-api-websocket');
            span = tracer.startSpan('ws.emit', {
              attributes: { 'ws.event': eventName, room },
            });
          }
        } catch {
          span = null;
        }

        server.to(room).emit(eventName, payload);
        const dur = (Date.now() - start) / 1000;
        try {
          this.metrics.websocketEventsEmitted.inc({ event: eventName });
          this.metrics.websocketBroadcastLatency.observe(
            { event: eventName },
            dur,
          );
        } catch {
          // non-blocking
        }

        try {
          span?.end?.();
        } catch {
          // ignore
        }
      } catch (err) {
        this.logger.warn(
          `Failed to emit event ${eventName} to ${room}: ${String(err)}`,
        );
        try {
          this.metrics.websocketBroadcastFailures.inc({ event: eventName });
        } catch {
          // non-blocking
        }
      }
    }
  }
}
