import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Socket } from 'socket.io';

export const SocketContext = createParamDecorator(
  (
    _: unknown,
    ctx: ExecutionContext,
  ):
    | { userId: string; tenantId: string; outletId: string | null }
    | undefined => {
    const client = ctx.switchToWs().getClient<Socket>();
    const data = client.data as
      | { ctx?: { userId: string; tenantId: string; outletId: string | null } }
      | undefined;
    return data?.ctx;
  },
);
