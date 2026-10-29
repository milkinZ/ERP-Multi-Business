import { PlatformAdminRole } from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import { AuthTokensService } from './services/auth-tokens.service';
import { PlatformIdentityAuthService } from './platform-identity-auth.service';
import type {
  OpenIdClientApi,
  OpenIdClientLoader,
} from './openid-client-loader';

describe('PlatformIdentityAuthService', () => {
  const originalOidcSettings = {
    issuer: process.env.PLATFORM_OIDC_ISSUER,
    clientId: process.env.PLATFORM_OIDC_CLIENT_ID,
    clientSecret: process.env.PLATFORM_OIDC_CLIENT_SECRET,
    callbackUrl: process.env.PLATFORM_OIDC_CALLBACK_URL,
    frontendCallbackUrl: process.env.PLATFORM_OIDC_FRONTEND_CALLBACK_URL,
    stateHmacSecret: process.env.PLATFORM_OIDC_STATE_HMAC_SECRET,
    allowedAcrValues: process.env.PLATFORM_OIDC_ALLOWED_ACR_VALUES,
  };
  const originalNodeEnv = process.env.NODE_ENV;
  const identityFindUnique = jest.fn();
  const sessionCreate = jest.fn<
    Promise<{ id: string }>,
    [
      {
        data: {
          identityId: string;
          tokenHash: string;
          expiresAt: Date;
        };
      },
    ]
  >();
  const sessionFindFirst = jest.fn<
    Promise<{
      id: string;
      identity: { id: string; role: PlatformAdminRole };
    } | null>,
    [Record<string, unknown>]
  >();
  const sessionUpdateMany = jest.fn<
    Promise<{ count: number }>,
    [Record<string, unknown>]
  >();
  const issuePlatformAccessToken = jest.fn();
  const discovery = jest.fn();
  const allowInsecureRequests = jest.fn();
  const clientSecretBasic = jest.fn();
  const randomPkceCodeVerifier = jest.fn();
  const calculatePkceCodeChallenge = jest.fn();
  const randomState = jest.fn();
  const randomNonce = jest.fn();
  const buildAuthorizationUrl = jest.fn();
  const authorizationCodeGrant = jest.fn();
  const prisma = {
    platformIdentity: { findUnique: identityFindUnique },
    platformSession: {
      create: sessionCreate,
      findFirst: sessionFindFirst,
      updateMany: sessionUpdateMany,
    },
  } as unknown as PrismaService;
  const tokens = {
    issuePlatformAccessToken,
  } as unknown as AuthTokensService;
  const oidcClient = {
    discovery,
    allowInsecureRequests,
    ClientSecretBasic: clientSecretBasic,
    randomPKCECodeVerifier: randomPkceCodeVerifier,
    calculatePKCECodeChallenge: calculatePkceCodeChallenge,
    randomState,
    randomNonce,
    buildAuthorizationUrl,
    authorizationCodeGrant,
  } as unknown as OpenIdClientApi;
  const loadOidcClient: OpenIdClientLoader = () => Promise.resolve(oidcClient);
  let service: PlatformIdentityAuthService;
  let configuration: Awaited<ReturnType<OpenIdClientApi['discovery']>>;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.PLATFORM_OIDC_ISSUER = 'https://issuer.example.test';
    process.env.PLATFORM_OIDC_CLIENT_ID = 'platform-client';
    process.env.PLATFORM_OIDC_CLIENT_SECRET = 'client-secret';
    process.env.PLATFORM_OIDC_CALLBACK_URL =
      'https://api.example.test/auth/platform/oidc/callback';
    process.env.PLATFORM_OIDC_FRONTEND_CALLBACK_URL =
      'https://app.example.test/platform/auth/callback';
    process.env.PLATFORM_OIDC_STATE_HMAC_SECRET =
      'state-hmac-secret-that-is-long-enough-for-testing';
    process.env.PLATFORM_OIDC_ALLOWED_ACR_VALUES =
      'urn:example:mfa,urn:example:phishing-resistant';

    jest.clearAllMocks();
    configuration = {} as Awaited<ReturnType<OpenIdClientApi['discovery']>>;
    service = new PlatformIdentityAuthService(prisma, tokens, loadOidcClient);
    discovery.mockResolvedValue(configuration);
    clientSecretBasic.mockReturnValue(() => undefined);
    randomPkceCodeVerifier.mockReturnValue('test-code-verifier');
    calculatePkceCodeChallenge.mockResolvedValue('test-code-challenge');
    randomState.mockReturnValue('test-state');
    randomNonce.mockReturnValue('test-nonce');
    buildAuthorizationUrl.mockReturnValue(
      new URL('https://issuer.example.test/authorize'),
    );
    sessionCreate.mockResolvedValue({ id: 'platform-session-1' });
    identityFindUnique.mockResolvedValue({
      id: 'platform-identity-1',
      disabledAt: null,
    });
    issuePlatformAccessToken.mockResolvedValue('platform-access-token');
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    for (const [key, value] of Object.entries(originalOidcSettings)) {
      const envName = `PLATFORM_OIDC_${key
        .replace(/[A-Z]/g, (letter) => `_${letter}`)
        .toUpperCase()}`;
      if (value === undefined) delete process.env[envName];
      else process.env[envName] = value;
    }
  });

  it('starts OIDC with state, nonce, PKCE, and requested MFA assurance', async () => {
    const request = await service.createAuthorizationRequest();

    expect(discovery).toHaveBeenCalledWith(
      new URL('https://issuer.example.test'),
      'platform-client',
      { client_secret: 'client-secret' },
      expect.any(Function),
    );
    expect(buildAuthorizationUrl).toHaveBeenCalledWith(configuration, {
      response_type: 'code',
      redirect_uri: 'https://api.example.test/auth/platform/oidc/callback',
      scope: 'openid email profile',
      state: 'test-state',
      nonce: 'test-nonce',
      code_challenge: 'test-code-challenge',
      code_challenge_method: 'S256',
      acr_values: 'urn:example:mfa urn:example:phishing-resistant',
    });

    expect(request.authorizationUrl).toBe(
      'https://issuer.example.test/authorize',
    );
    expect(request.stateCookie).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it('allows insecure OIDC discovery only for loopback development issuers', async () => {
    process.env.PLATFORM_OIDC_ISSUER =
      'http://127.0.0.1:8180/realms/erp-platform-dev';

    await service.createAuthorizationRequest();

    expect(discovery).toHaveBeenCalledWith(
      new URL('http://127.0.0.1:8180/realms/erp-platform-dev'),
      'platform-client',
      { client_secret: 'client-secret' },
      expect.any(Function),
      { execute: [allowInsecureRequests] },
    );
  });

  it.each([
    ['production', 'http://127.0.0.1:8180/realms/erp-platform-dev'],
    ['test', 'http://identity.example.test/realms/erp-platform-dev'],
  ])(
    'rejects insecure non-loopback issuers in %s mode',
    async (nodeEnv, issuer) => {
      process.env.NODE_ENV = nodeEnv;
      process.env.PLATFORM_OIDC_ISSUER = issuer;

      await expect(service.createAuthorizationRequest()).rejects.toThrow(
        'Platform OIDC requires HTTPS except for loopback development issuers',
      );
      expect(discovery).not.toHaveBeenCalled();
    },
  );

  it('provisions a short absolute session only for an explicitly provisioned MFA identity', async () => {
    authorizationCodeGrant.mockResolvedValue({
      claims: () => ({
        iss: 'https://issuer.example.test',
        sub: 'subject-1',
        acr: 'urn:example:mfa',
      }),
    });
    const { stateCookie } = await service.createAuthorizationRequest();
    const before = Date.now();

    const login = await service.completeAuthorization(
      '/auth/platform/oidc/callback?code=authorization-code&state=test-state',
      stateCookie,
    );

    expect(authorizationCodeGrant).toHaveBeenCalledWith(
      configuration,
      expect.any(URL),
      {
        pkceCodeVerifier: 'test-code-verifier',
        expectedState: 'test-state',
        expectedNonce: 'test-nonce',
      },
    );
    expect(identityFindUnique).toHaveBeenCalledWith({
      where: {
        issuer_subject: {
          issuer: 'https://issuer.example.test',
          subject: 'subject-1',
        },
      },
      select: { id: true, disabledAt: true },
    });
    expect(sessionCreate).toHaveBeenCalledTimes(1);
    const createArgs = sessionCreate.mock.calls[0]?.[0];
    expect(createArgs?.data.identityId).toBe('platform-identity-1');
    expect(createArgs?.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createArgs?.data.expiresAt).toBeInstanceOf(Date);
    expect(login.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(login.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + 4 * 60 * 60 * 1000 - 1000,
    );
    expect(login.expiresAt.getTime()).toBeLessThanOrEqual(
      before + 4 * 60 * 60 * 1000 + 1000,
    );
    expect(login.frontendCallbackUrl).toBe(
      'https://app.example.test/platform/auth/callback',
    );
  });

  it('rejects missing or unapproved MFA assurance before identity lookup', async () => {
    authorizationCodeGrant.mockResolvedValue({
      claims: () => ({
        iss: 'https://issuer.example.test',
        sub: 'subject-1',
      }),
    });
    const { stateCookie } = await service.createAuthorizationRequest();

    await expect(
      service.completeAuthorization(
        '/auth/platform/oidc/callback?code=authorization-code&state=test-state',
        stateCookie,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(identityFindUnique).not.toHaveBeenCalled();
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('rejects an MFA assurance value outside the configured allowlist', async () => {
    authorizationCodeGrant.mockResolvedValue({
      claims: () => ({
        iss: 'https://issuer.example.test',
        sub: 'subject-1',
        acr: 'urn:example:password-only',
      }),
    });
    const { stateCookie } = await service.createAuthorizationRequest();

    await expect(
      service.completeAuthorization(
        '/auth/platform/oidc/callback?code=authorization-code&state=test-state',
        stateCookie,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(identityFindUnique).not.toHaveBeenCalled();
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it.each([null, { id: 'platform-identity-1', disabledAt: new Date() }])(
    'rejects unprovisioned or disabled subjects without creating a session',
    async (identity) => {
      authorizationCodeGrant.mockResolvedValue({
        claims: () => ({
          iss: 'https://issuer.example.test',
          sub: 'subject-1',
          acr: 'urn:example:mfa',
        }),
      });
      identityFindUnique.mockResolvedValue(identity);
      const { stateCookie } = await service.createAuthorizationRequest();

      await expect(
        service.completeAuthorization(
          '/auth/platform/oidc/callback?code=authorization-code&state=test-state',
          stateCookie,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(sessionCreate).not.toHaveBeenCalled();
    },
  );

  it('rejects a tampered state cookie before exchanging the authorization code', async () => {
    const { stateCookie } = await service.createAuthorizationRequest();
    const tamperedCookie = `${stateCookie.slice(0, -1)}x`;

    await expect(
      service.completeAuthorization(
        '/auth/platform/oidc/callback?code=authorization-code&state=test-state',
        tamperedCookie,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(authorizationCodeGrant).not.toHaveBeenCalled();
  });

  it('issues a platform access token only for an active, unexpired session', async () => {
    sessionFindFirst.mockResolvedValue({
      id: 'platform-session-1',
      identity: {
        id: 'platform-identity-1',
        role: PlatformAdminRole.OPERATIONS,
      },
    });

    const result = await service.createAccessSession('a'.repeat(43));

    const findArgs = sessionFindFirst.mock.calls[0]?.[0];
    const where = findArgs?.where;
    expect(where).toMatchObject({
      revokedAt: null,
      identity: { disabledAt: null },
    });
    expect(where).toHaveProperty(
      'tokenHash',
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(where).toHaveProperty('expiresAt.gt', expect.any(Date));
    expect(findArgs?.include).toEqual({
      identity: { select: { id: true, role: true } },
    });
    expect(issuePlatformAccessToken).toHaveBeenCalledWith(
      'platform-identity-1',
      'platform-session-1',
    );
    expect(result).toMatchObject({
      accessToken: 'platform-access-token',
      session: {
        scope: 'platform',
        userId: 'platform-identity-1',
        platformIdentityId: 'platform-identity-1',
      },
    });
  });

  it('revokes a valid session token idempotently', async () => {
    sessionUpdateMany.mockResolvedValue({ count: 1 });

    await service.revokeSession('a'.repeat(43));

    const updateArgs = sessionUpdateMany.mock.calls[0]?.[0];
    expect(updateArgs?.where).toMatchObject({ revokedAt: null });
    expect(updateArgs?.where).toHaveProperty(
      'tokenHash',
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(updateArgs?.data).toHaveProperty('revokedAt', expect.any(Date));
  });
});
