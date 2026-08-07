import { Injectable, Logger } from '@nestjs/common';

import type { Socket } from 'socket.io';

export type AuthenticatedSocketContext = {
  userId: string;
  tenantId: string;
  outletId?: string | null;
};

@Injectable()
export class WebsocketService {
  private readonly logger = new Logger(WebsocketService.name);

  attachContext(socket: Socket, ctx: AuthenticatedSocketContext): void {
    // socket.data is `any` in socket.io types; keep assignment localized.
    (socket.data as { ctx?: AuthenticatedSocketContext }).ctx = ctx;
  }

  getContext(socket: Socket): AuthenticatedSocketContext | undefined {
    const data = socket.data as { ctx?: AuthenticatedSocketContext };
    return data.ctx;
  }

  tenantRoom(tenantId: string) {
    return `tenant:${tenantId}`;
  }

  outletRoom(outletId: string) {
    return `outlet:${outletId}`;
  }

  userRoom(userId: string) {
    return `user:${userId}`;
  }

  joinTenantRoom(socket: Socket, tenantId: string) {
    return socket.join(this.tenantRoom(tenantId));
  }

  joinOutletRoom(socket: Socket, outletId: string | null | undefined) {
    if (!outletId) return Promise.resolve();
    return socket.join(this.outletRoom(outletId));
  }

  joinUserRoom(socket: Socket, userId: string) {
    return socket.join(this.userRoom(userId));
  }

  leaveAllRooms(socket: Socket) {
    // socket.io v4 keeps rooms set; we just leave all.
    return Promise.all(
      Array.from(socket.rooms).map((room) => socket.leave(room)) as Array<
        Promise<unknown>
      >,
    );
  }
}
