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

    // NOTE: this project’s Prisma schema creates Role/Outlet assignment via join tables.
    // Existing UsersService.create currently expects roleId; keep as-is for now.
    const user = await this.usersService.create({
      ...data,
      password: hashedPassword,
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

    res.cookie(REFRESH_COOKIE_NAME, refreshTokenPlain, {
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
    const tokenHash = await this.authTokens.hashRefreshToken(refreshTokenPlain);
    const tokenRow = await this.refreshTokens.getByHash(tokenHash);

    if (tokenRow?.id) {
      const revokedAt = new Date();
      await this.refreshTokens.revokeById(tokenRow.id, revokedAt);
    }

    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/auth' });
    res.clearCookie(CSRF_COOKIE_NAME, { path: '/auth' });

    return { success: true };
  }

  async refresh(refreshTokenPlain: string, csrfToken: string, res: Response) {
    if (!refreshTokenPlain) {
      throw new BadRequestException('refreshToken is required');
    }

    // CSRF is validated by CsrfRefreshGuard; keep defensive no-op.
    void csrfToken;

    const tokenHash = await this.authTokens.hashRefreshToken(refreshTokenPlain);
    const tokenRow = await this.refreshTokens.getByHash(tokenHash);

    if (!tokenRow || tokenRow.revokedAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const accessPayload = await this.authTokens.buildAccessPayload({
      userId: tokenRow.userId,
      tenantId: tokenRow.tenantId,
      outletId: tokenRow.outletId,
    });

    const accessToken = await this.authTokens.issueAccessToken(accessPayload);

    const newPlain = this.authTokens.createRefreshTokenPlain();
    const rotated = await this.refreshRotation.rotate({
      userId: tokenRow.userId,
      tenantId: tokenRow.tenantId,
      oldTokenSelector: tokenRow.tokenSelector,
      oldTokenSecret: refreshTokenPlain,
      newTokenPlain: newPlain,
      newExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    });

    res.cookie(REFRESH_COOKIE_NAME, rotated.newTokenPlain, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/auth',
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });

    return { accessToken };
  }
}
