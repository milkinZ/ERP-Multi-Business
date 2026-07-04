import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Response } from 'express';

import { UsersService } from '../users/users.service';
import { PrismaService } from '../../core/database/prisma.service';

import { AuthTokensService } from './services/auth-tokens.service';
import { RefreshTokensService } from './services/refresh-tokens.service';
import { SessionsService } from './services/sessions.service';
import { RefreshRotationService } from './services/refresh-rotation.service';
import { RefreshTokenSelectorsService } from './services/refresh-token-selectors.service';
import { RefreshSecretHashService } from './services/refresh-secret-hash.service';

import {
  CSRF_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
} from '../../infrastructure/security/security.constants';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private prisma: PrismaService,
    private authTokens: AuthTokensService,
    private refreshTokens: RefreshTokensService,
    private sessions: SessionsService,
    private refreshRotation: RefreshRotationService,
    private selectors: RefreshTokenSelectorsService,
    private secretHasher: RefreshSecretHashService,
  ) {}

  async register(data: {
    email: string;
    password: string;
    tenantId: string;
    roleId: string;
    outletId?: string | null;
  }) {
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Follow the same security conventions as login:
    // - password is hashed
    // - user lookup/creation is tenant-scoped via provided tenantId
    // - outlet assignment is optional
    // NOTE: UsersService currently creates only the User row.
    const user = await this.usersService.create({
      email: data.email,
      password: hashedPassword,
      tenantId: data.tenantId,
      // roleId: data.roleId,
    });

    // If outletId is provided, the join table assignment is expected to be handled here.
    // Currently Prisma schema includes UserOutlet and UserRole join tables.
    if (data.outletId) {
      await this.prisma.userOutlet.create({
        data: {
          userId: user.id,
          outletId: data.outletId,
          tenantId: data.tenantId,
        },
      });
    }

    // Ensure role assignment exists via join table.
    await this.prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: data.roleId,
        tenantId: data.tenantId,
      },
    });

    return user;
  }

  async login(email: string, password: string, res: Response) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const roleRow = await this.prisma.userRole.findFirst({
      where: { userId: user.id, tenantId: user.tenantId, deletedAt: null },
    });

    if (!roleRow) {
      throw new UnauthorizedException('No role assigned');
    }

    const outletRow = await this.prisma.userOutlet.findFirst({
      where: { userId: user.id, tenantId: user.tenantId, deletedAt: null },
    });

    const outletId = outletRow?.outletId ?? null;

    const accessPayload = await this.authTokens.buildAccessPayload({
      userId: user.id,
      tenantId: user.tenantId,
      outletId,
    });

    const accessToken = await this.authTokens.issueAccessToken(accessPayload);

    const refreshTokenPlain = this.authTokens.createRefreshTokenPlain();
    const tokenSelector = this.selectors.createSelector();
    const tokenHash = await this.authTokens.hashRefreshToken(refreshTokenPlain);

    const csrfToken = this.authTokens.createRefreshTokenPlain();

    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

    await this.refreshTokens.create({
      tokenSelector,
      tokenHash,
      userId: user.id,
      tenantId: user.tenantId,
      roleId: roleRow.roleId,
      outletId,
      expiresAt,
    });

    // Session id is stored separately. We use a new sessionId distinct from refresh token id.
    const sessionId = this.authTokens.createRefreshTokenPlain();
    await this.sessions.create({
      sessionId,
      userId: user.id,
      tenantId: user.tenantId,
      outletId,
    });

    res.cookie(REFRESH_COOKIE_NAME, `${tokenSelector}.${refreshTokenPlain}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/auth',
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });

    res.cookie(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/auth',
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });

    return { accessToken };
  }

  async logout(refreshTokenPlain: string, res: Response) {
    // refreshTokenPlain is expected in the same format used by /auth/refresh: {selector}.{secret}
    const parsed = refreshTokenPlain.includes('.')
      ? (() => {
          const [selector, rest] = refreshTokenPlain.split('.', 2);
          return { selector, rest };
        })()
      : null;

    if (parsed?.selector) {
      const tokenRow = await this.refreshTokens.getBySelector(parsed.selector);

      if (tokenRow?.id) {
        const revokedAt = new Date();
        await this.refreshTokens.revokeById(tokenRow.id, revokedAt);
      }
    }

    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/auth' });
    res.clearCookie(CSRF_COOKIE_NAME, { path: '/auth' });

    return { success: true };
  }

  async refresh(refreshTokenPlain: string, csrfToken: string, res: Response) {
    if (!refreshTokenPlain) {
      throw new BadRequestException('refreshToken is required');
    }

    // CSRF validation is done by CsrfRefreshGuard; keep defensive checks too.
    if (!csrfToken) {
      throw new UnauthorizedException('Invalid CSRF token');
    }

    // Refresh token lookup strategy:
    // - bcrypt hash is salted, so we cannot query by deterministic hash.
    // - Therefore we require selector prefix in the cookie payload: {selector}.{secret}.
    const parsed = refreshTokenPlain.includes('.')
      ? (() => {
          const [selector, rest] = refreshTokenPlain.split('.', 2);
          return { selector, rest };
        })()
      : null;

    if (!parsed?.selector || !parsed.rest) {
      throw new UnauthorizedException('Invalid refresh token format');
    }

    const tokenRow = await this.refreshTokens.getBySelector(parsed.selector);

    if (!tokenRow || tokenRow.revokedAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Ensure selector matches provided selector (replay protection scope)
    if (tokenRow.tokenSelector !== parsed.selector) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const accessPayload = await this.authTokens.buildAccessPayload({
      userId: tokenRow.userId,
      tenantId: tokenRow.tenantId,
      outletId: tokenRow.outletId,
    });

    const accessToken = await this.authTokens.issueAccessToken(accessPayload);

    const newPlain = this.authTokens.createRefreshTokenPlain();
    const newExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

    const rotated = await this.refreshRotation.rotate({
      userId: tokenRow.userId,
      tenantId: tokenRow.tenantId,
      oldTokenSelector: tokenRow.tokenSelector,
      oldTokenSecret: parsed.rest,
      newTokenPlain: newPlain,
      newExpiresAt,
    });

    // Rotation should also update CSRF token; current design keeps CSRF cookie stable for 30 days.
    res.cookie(
      REFRESH_COOKIE_NAME,
      `${rotated.newTokenSelector}.${rotated.newTokenPlain}`,
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/auth',
        maxAge: 1000 * 60 * 60 * 24 * 30,
      },
    );

    return { accessToken };
  }
}
