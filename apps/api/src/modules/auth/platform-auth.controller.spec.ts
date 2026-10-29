import { UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';

import { PlatformIdentityAuthService } from './platform-identity-auth.service';
import { PlatformAuthController } from './platform-auth.controller';
import {
  PLATFORM_CSRF_COOKIE_NAME,
  PLATFORM_OIDC_STATE_COOKIE_NAME,
  PLATFORM_SESSION_COOKIE_NAME,
} from '../../infrastructure/security/security.constants';

describe('PlatformAuthController', () => {
  const createAuthorizationRequest = jest.fn();
  const completeAuthorization = jest.fn();
  const createAccessSession = jest.fn();
  const revokeSession = jest.fn();
  const getFrontendCallbackUrl = jest.fn();
  const service = {
    createAuthorizationRequest,
    completeAuthorization,
    createAccessSession,
    revokeSession,
    getFrontendCallbackUrl,
  } as unknown as PlatformIdentityAuthService;
  const cookie = jest.fn();
  const clearCookie = jest.fn();
  const redirect = jest.fn();
  const response = { cookie, clearCookie, redirect } as unknown as Response;
  let controller: PlatformAuthController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PlatformAuthController(service);
    createAuthorizationRequest.mockResolvedValue({
      authorizationUrl: 'https://issuer.example.test/authorize',
      stateCookie: 'signed-state-cookie',
    });
    completeAuthorization.mockResolvedValue({
      sessionToken: 'platform-session-cookie-value',
      expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
      frontendCallbackUrl: 'https://app.example.test/platform/auth/callback',
    });
    createAccessSession.mockResolvedValue({
      accessToken: 'platform-access-token',
    });
    getFrontendCallbackUrl.mockReturnValue(
      'https://app.example.test/platform/auth/callback',
    );
  });

  it('sets a short-lived HttpOnly OIDC state cookie before redirecting', async () => {
    await controller.login(response);

    expect(cookie).toHaveBeenCalledWith(
      PLATFORM_OIDC_STATE_COOKIE_NAME,
      'signed-state-cookie',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/auth/platform/oidc',
        maxAge: 5 * 60 * 1000,
      }),
    );
    expect(redirect).toHaveBeenCalledWith(
      'https://issuer.example.test/authorize',
    );
  });

  it('sets the opaque platform session cookie and redirects without putting tokens in the URL', async () => {
    const request = {
      originalUrl:
        '/auth/platform/oidc/callback?code=code-value&state=state-value',
      cookies: { [PLATFORM_OIDC_STATE_COOKIE_NAME]: 'signed-state-cookie' },
    } as unknown as Request;

    await controller.callback(request, response);

    expect(completeAuthorization).toHaveBeenCalledWith(
      request.originalUrl,
      'signed-state-cookie',
    );
    expect(clearCookie).toHaveBeenCalledWith(PLATFORM_OIDC_STATE_COOKIE_NAME, {
      path: '/auth/platform/oidc',
    });
    expect(cookie).toHaveBeenCalledWith(
      PLATFORM_SESSION_COOKIE_NAME,
      'platform-session-cookie-value',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/auth/platform',
      }),
    );
    expect(redirect).toHaveBeenCalledWith(
      'https://app.example.test/platform/auth/callback',
    );
  });

  it('redirects known authentication failures to a generic frontend error', async () => {
    completeAuthorization.mockRejectedValue(
      new UnauthorizedException('identity is not provisioned'),
    );
    const request = {
      originalUrl: '/auth/platform/oidc/callback?error=access_denied',
      cookies: {},
    } as unknown as Request;

    await controller.callback(request, response);

    expect(redirect).toHaveBeenCalledWith(
      'https://app.example.test/platform/auth/callback?error=authentication_failed',
    );
    expect(cookie).not.toHaveBeenCalled();
  });

  it('issues a separate HttpOnly platform CSRF cookie', () => {
    const result = controller.csrf(response);

    expect(result.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookie).toHaveBeenCalledWith(
      PLATFORM_CSRF_COOKIE_NAME,
      result.csrfToken,
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/auth/platform',
        maxAge: 15 * 60 * 1000,
      }),
    );
  });

  it('revokes and clears the opaque platform session on logout', async () => {
    const request = {
      cookies: {
        [PLATFORM_SESSION_COOKIE_NAME]: 'platform-session-cookie-value',
      },
    } as unknown as Request;

    await controller.logout(request, response);

    expect(revokeSession).toHaveBeenCalledWith('platform-session-cookie-value');
    expect(clearCookie).toHaveBeenCalledWith(PLATFORM_SESSION_COOKIE_NAME, {
      path: '/auth/platform',
    });
    expect(clearCookie).toHaveBeenCalledWith(PLATFORM_CSRF_COOKIE_NAME, {
      path: '/auth/platform',
    });
  });
});
