import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { PrismaService } from '../../../core/database/prisma.service';

import { AuthTokensService } from './auth-tokens.service';
import { RefreshTokensService } from './refresh-tokens.service';
import { SessionsService } from './sessions.service';

import { CSRF_COOKIE_NAME } from '../../../infrastructure/security/security.constants';

@Injectable()
export class AuthRefreshService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private authTokens: AuthTokensService,
    private refreshTokens: RefreshTokensService,
    private sessions: SessionsService,
  ) {}

  private parseRefreshCsrf(request: unknown): string | undefined {
    if (!request || typeof request !== 'object') return undefined;

    const req = request as Record<string, unknown>;
    const cookies = req['cookies'];
    if (!cookies || typeof cookies !== 'object') return undefined;

    const cookieRecord = cookies as Record<string, unknown>;
    const csrf = cookieRecord[CSRF_COOKIE_NAME];
    return typeof csrf === 'string' ? csrf : undefined;
  }

  refresh(params: {
    userAgent?: string;
    // keep for future implementation, but not used in placeholder
    refreshToken: string;
    csrfToken: string;
    sessionId?: string;
    request: unknown;
  }) {
    const { csrfToken, request } = params;

    const refreshCsrfCookie = this.parseRefreshCsrf(request);
    if (!refreshCsrfCookie) {
      throw new UnauthorizedException('Missing refresh CSRF cookie');
    }
    if (refreshCsrfCookie !== csrfToken) {
      throw new UnauthorizedException('Invalid CSRF token');
    }

    // We store bcrypt hash, but we also stored tokenHash as the bcrypt output.
    // Therefore we do lookup by a deterministic tokenHash preimage is not possible.
    // Current implementation will instead decode refresh token payload, then validate against DB by tokenId.
    // NOTE: This placeholder is intentionally minimal until refresh token JWT is defined.
    throw new BadRequestException(
      'Refresh token implementation pending token strategy',
    );
  }

  // Token rotation/logout helpers (used after full refresh-token strategy is implemented)
  async revokeRefreshTokenById(tokenId: string) {
    await this.refreshTokens.revokeById(tokenId, new Date());
  }

  async revokeAllRefreshTokensForUser(userId: string) {
    await this.refreshTokens.revokeAllForUser(userId, new Date());
  }
}
