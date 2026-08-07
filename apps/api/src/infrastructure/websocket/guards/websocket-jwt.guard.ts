import {
  CanActivate,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Socket } from 'socket.io';

import { ConfigService } from '@nestjs/config';

import jwt from 'jsonwebtoken';

type JwtPayloadLike = {
  userId?: unknown;
  tenantId?: unknown;
  outletId?: unknown;
};

@Injectable()
export class WebsocketJwtGuard implements CanActivate {
  private readonly logger = new Logger(WebsocketJwtGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: unknown): boolean {
    const execContext = context as {
      switchToWs: () => { getClient: () => Socket };
    };
    const socket = execContext.switchToWs().getClient();

    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      socket.handshake.headers?.authorization;

    if (!token) {
      throw new UnauthorizedException('Missing JWT');
    }

    const jwtToken = token.startsWith('Bearer ') ? token.slice(7) : token;
    const secret = this.configService.get<string>('JWT_ACCESS_SECRET');

    if (!secret) {
      this.logger.error('Missing JWT_ACCESS_SECRET');
      throw new UnauthorizedException('JWT secret not configured');
    }

    try {
      const payload = jwt.verify(jwtToken, secret);

      if (typeof payload !== 'object' || payload === null) {
        throw new UnauthorizedException('Invalid JWT payload');
      }

      const typedPayload = payload as JwtPayloadLike;

      const socketData = socket.data as unknown as {
        ctx?: {
          userId: string;
          tenantId: string;
          outletId: string | null;
        };
      };

      socketData.ctx = {
        userId: typedPayload.userId as string,
        tenantId: typedPayload.tenantId as string,
        outletId: (typedPayload.outletId as string | undefined) ?? null,
      };

      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired JWT');
    }
  }
}
