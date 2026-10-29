import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';

import { PlatformIdentityAuthService } from './platform-identity-auth.service';
import { PlatformCsrfGuard } from '../../infrastructure/security/platform-csrf.guard';
import {
  PLATFORM_CSRF_COOKIE_NAME,
  PLATFORM_OIDC_STATE_COOKIE_NAME,
  PLATFORM_SESSION_COOKIE_NAME,
} from '../../infrastructure/security/security.constants';

const PLATFORM_COOKIE_PATH = '/auth/platform';
const OIDC_STATE_COOKIE_PATH = `${PLATFORM_COOKIE_PATH}/oidc`;

function cookieValue(request: Request, name: string): string | undefined {
  const cookies: unknown = request.cookies;
  if (
    typeof cookies !== 'object' ||
    cookies === null ||
    Array.isArray(cookies)
  ) {
    return undefined;
  }
  const value = (cookies as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : undefined;
}

@Controller('auth/platform')
export class PlatformAuthController {
  constructor(private readonly platformAuth: PlatformIdentityAuthService) {}

  @Get('oidc/login')
  async login(@Res() response: Response) {
    const authorization = await this.platformAuth.createAuthorizationRequest();
    response.cookie(
      PLATFORM_OIDC_STATE_COOKIE_NAME,
      authorization.stateCookie,
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: OIDC_STATE_COOKIE_PATH,
        maxAge: 5 * 60 * 1000,
      },
    );
    return response.redirect(authorization.authorizationUrl);
  }

  @Get('oidc/callback')
  async callback(@Req() request: Request, @Res() response: Response) {
    const stateCookie = cookieValue(request, PLATFORM_OIDC_STATE_COOKIE_NAME);
    response.clearCookie(PLATFORM_OIDC_STATE_COOKIE_NAME, {
      path: OIDC_STATE_COOKIE_PATH,
    });

    try {
      const login = await this.platformAuth.completeAuthorization(
        request.originalUrl,
        stateCookie,
      );
      response.cookie(PLATFORM_SESSION_COOKIE_NAME, login.sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: PLATFORM_COOKIE_PATH,
        maxAge: login.expiresAt.getTime() - Date.now(),
      });
      return response.redirect(login.frontendCallbackUrl);
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) throw error;
      const callbackUrl = new URL(this.platformAuth.getFrontendCallbackUrl());
      callbackUrl.searchParams.set('error', 'authentication_failed');
      return response.redirect(callbackUrl.toString());
    }
  }

  @Get('csrf')
  csrf(@Res({ passthrough: true }) response: Response) {
    const csrfToken = randomBytes(32).toString('base64url');
    response.cookie(PLATFORM_CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: PLATFORM_COOKIE_PATH,
      maxAge: 15 * 60 * 1000,
    });
    return { csrfToken };
  }

  @Get('session')
  session(@Req() request: Request) {
    return this.platformAuth.createAccessSession(
      cookieValue(request, PLATFORM_SESSION_COOKIE_NAME),
    );
  }

  @UseGuards(PlatformCsrfGuard)
  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.platformAuth.revokeSession(
      cookieValue(request, PLATFORM_SESSION_COOKIE_NAME),
    );
    response.clearCookie(PLATFORM_SESSION_COOKIE_NAME, {
      path: PLATFORM_COOKIE_PATH,
    });
    response.clearCookie(PLATFORM_CSRF_COOKIE_NAME, {
      path: PLATFORM_COOKIE_PATH,
    });
    return { success: true };
  }
}
