import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Socket } from 'socket.io';

import { ConfigService } from '@nestjs/config';

import jwt from 'jsonwebtoken';

@Injectable()
export class JwtWsAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const socket = context.switchToWs().getClient<Socket>();

    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      socket.handshake.headers?.authorization;

    if (!token) {
      throw new UnauthorizedException('Missing JWT');
    }

    const jwtToken = token.startsWith('Bearer ') ? token.slice(7) : token;
    const secret = this.configService.get<string>('JWT_ACCESS_SECRET');

    if (!secret) {
      throw new UnauthorizedException('JWT secret not configured');
    }

    try {
      const payload = jwt.verify(jwtToken, secret);

      if (typeof payload !== 'object' || payload === null) {
        throw new UnauthorizedException('Invalid JWT payload');
      }

      const typedPayload = payload as {
        userId?: string;
        tenantId?: string;
        outletId?: string | null;
      };

      if (!typedPayload.userId || !typedPayload.tenantId) {
        throw new UnauthorizedException('Invalid JWT payload');
      }

      const socketData = socket.data as {
        ctx?: { userId: string; tenantId: string; outletId: string | null };
      };
      socketData.ctx = {
        userId: typedPayload.userId,
        tenantId: typedPayload.tenantId,
        outletId: typedPayload.outletId ?? null,
      };

      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired JWT');
    }
  }
}
