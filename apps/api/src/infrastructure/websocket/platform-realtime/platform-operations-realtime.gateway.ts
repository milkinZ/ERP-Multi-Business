import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import jwt from 'jsonwebtoken';
import type { Server, Socket } from 'socket.io';

import { PrismaService } from '../../../core/database/prisma.service';
import { PERMISSIONS } from '../../../modules/rbac/permissions';
import { permissionsForPlatformRole } from '../../../modules/auth/platform-role-permissions';

const PLATFORM_OPERATIONS_ROOM = 'platform:operations';
const REVALIDATE_INTERVAL_MS = 30_000;

type PlatformSocketClaims = {
  sub?: unknown;
  scope?: unknown;
  platformSessionId?: unknown;
  exp?: unknown;
};

type PlatformSocketContext = {
  identityId: string;
  sessionId: string;
  expiresAt: number;
};

const allowedOrigins = (
  process.env.CORS_ORIGIN ?? 'http://localhost:3000,http://localhost:3001'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

@WebSocketGateway({
  namespace: '/platform-operations',
  cors: { origin: allowedOrigins, credentials: true },
  transports: ['websocket', 'polling'],
  serveClient: false,
})
export class PlatformOperationsRealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(PlatformOperationsRealtimeGateway.name);
  private readonly validationTimers = new Map<string, NodeJS.Timeout>();

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const context = await this.authenticate(client);
      if (!context) {
        client.disconnect(true);
        return;
      }
      if (!client.connected) return;

      (
        client.data as { platformContext?: PlatformSocketContext }
      ).platformContext = context;
      await client.join(PLATFORM_OPERATIONS_ROOM);
      const timer = setInterval(() => {
        void this.revalidate(client, context);
      }, REVALIDATE_INTERVAL_MS);
      timer.unref();
      this.validationTimers.set(client.id, timer);
    } catch (error) {
      this.logger.warn(
        `Rejected platform realtime connection (${error instanceof Error ? error.name : 'UnknownError'})`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const timer = this.validationTimers.get(client.id);
    if (timer) clearInterval(timer);
    this.validationTimers.delete(client.id);
  }

  emitUpdate(): void {
    if (!this.server) return;
    this.server.local
      .to(PLATFORM_OPERATIONS_ROOM)
      .emit('platform.operations.updated', {
        updatedAt: new Date().toISOString(),
      });
  }

  private async authenticate(
    client: Socket,
  ): Promise<PlatformSocketContext | null> {
    const auth: unknown = client.handshake.auth;
    const token =
      typeof auth === 'object' && auth !== null && 'token' in auth
        ? auth.token
        : undefined;
    if (typeof token !== 'string' || token.length === 0) return null;

    const secret =
      this.config.get<string>('jwt.secret') ?? process.env.JWT_SECRET;
    if (!secret) return null;

    let claims: PlatformSocketClaims;
    try {
      const payload: unknown = jwt.verify(token, secret);
      if (typeof payload !== 'object' || payload === null) return null;
      claims = payload;
    } catch {
      return null;
    }

    if (
      claims.scope !== 'platform' ||
      typeof claims.sub !== 'string' ||
      typeof claims.platformSessionId !== 'string' ||
      typeof claims.exp !== 'number'
    ) {
      return null;
    }

    const context = {
      identityId: claims.sub,
      sessionId: claims.platformSessionId,
      expiresAt: claims.exp,
    };
    return (await this.isAuthorized(context)) ? context : null;
  }

  private async revalidate(
    client: Socket,
    context: PlatformSocketContext,
  ): Promise<void> {
    try {
      if (!(await this.isAuthorized(context))) {
        client.disconnect(true);
      }
    } catch (error) {
      this.logger.warn(
        `Platform realtime session revalidation failed (${error instanceof Error ? error.name : 'UnknownError'})`,
      );
      client.disconnect(true);
    }
  }

  private async isAuthorized(context: PlatformSocketContext): Promise<boolean> {
    if (Date.now() >= context.expiresAt * 1_000) return false;
    const [identity, session] = await Promise.all([
      this.prisma.platformIdentity.findFirst({
        where: { id: context.identityId, disabledAt: null },
        select: { role: true },
      }),
      this.prisma.platformSession.findFirst({
        where: {
          id: context.sessionId,
          identityId: context.identityId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      }),
    ]);

    return Boolean(
      identity &&
      session &&
      permissionsForPlatformRole(identity.role).includes(
        PERMISSIONS.SUPER_ADMIN_READ,
      ),
    );
  }
}
