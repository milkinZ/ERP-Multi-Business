import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

import { WebsocketGateway } from '../gateways/websocket.gateway';

type ServerLike = Pick<Server, 'to'> & {
  to: (room: string) => {
    emit: (event: string, data: unknown) => void;
  };
};

@Injectable()
export class RealtimeEventEmitter {
  constructor(private readonly websocketGateway: WebsocketGateway) {}

  emitToRooms(eventName: string, payload: unknown, rooms: string[]) {
    const server = (
      this.websocketGateway as unknown as {
        server?: ServerLike;
      }
    ).server;

    if (!server) return;

    for (const room of rooms) {
      server.to(room).emit(eventName, payload);
    }
  }
}
