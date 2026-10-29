import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type * as oidc from 'openid-client';
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import { PrismaService } from '../../core/database/prisma.service';
import { AuthTokensService } from './services/auth-tokens.service';
import { permissionsForPlatformRole } from './platform-role-permissions';
import { PLATFORM_OIDC_CLIENT } from './openid-client-loader';
import type {
  OpenIdClientApi,
  OpenIdClientLoader,
} from './openid-client-loader';

const OIDC_STATE_TTL_MS = 5 * 60 * 1000;
export const PLATFORM_SESSION_TTL_MS = 4 * 60 * 60 * 1000;

type PlatformOidcSettings = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  frontendCallbackUrl: string;
  stateHmacSecret: string;
  allowedAcrValues: string[];
};

type OidcState = {
  state: string;
  nonce: string;
  codeVerifier: string;
  issuedAt: number;
};

function isOidcState(value: unknown): value is OidcState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.state === 'string' &&
    typeof candidate.nonce === 'string' &&
    typeof candidate.codeVerifier === 'string' &&
    typeof candidate.issuedAt === 'number'
  );
}

@Injectable()
export class PlatformIdentityAuthService {
  private oidcClient?: Promise<OpenIdClientApi>;
  private oidcConfiguration?: Promise<oidc.Configuration>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly authTokens: AuthTokensService,
    @Inject(PLATFORM_OIDC_CLIENT)
    private readonly loadOidcClient: OpenIdClientLoader,
  ) {}

  async createAuthorizationRequest() {
    const settings = this.getSettings();
    const oidcClient = await this.getOidcClient();
    const configuration = await this.getOidcConfiguration(settings, oidcClient);
    const codeVerifier = oidcClient.randomPKCECodeVerifier();
    const codeChallenge =
      await oidcClient.calculatePKCECodeChallenge(codeVerifier);
    const state: OidcState = {
      state: oidcClient.randomState(),
      nonce: oidcClient.randomNonce(),
      codeVerifier,
      issuedAt: Date.now(),
    };
    const authorizationUrl = oidcClient.buildAuthorizationUrl(configuration, {
      response_type: 'code',
      redirect_uri: settings.callbackUrl,
      scope: 'openid email profile',
      state: state.state,
      nonce: state.nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      acr_values: settings.allowedAcrValues.join(' '),
    });

    return {
      authorizationUrl: authorizationUrl.toString(),
      stateCookie: this.signState(state, settings.stateHmacSecret),
    };
  }

  async completeAuthorization(
    originalUrl: string,
    stateCookie: string | undefined,
  ) {
    const settings = this.getSettings();
    const state = this.verifyState(
      stateCookie,
      settings.stateHmacSecret,
      Date.now(),
    );
    const callbackUrl = new URL(originalUrl, settings.callbackUrl);
    const configuredCallbackUrl = new URL(settings.callbackUrl);
    if (
      callbackUrl.origin !== configuredCallbackUrl.origin ||
      callbackUrl.pathname !== configuredCallbackUrl.pathname ||
      callbackUrl.searchParams.getAll('state').length !== 1 ||
      callbackUrl.searchParams.get('state') !== state.state
    ) {
      throw new UnauthorizedException('Invalid OIDC authorization response');
    }
    if (callbackUrl.searchParams.has('error')) {
      throw new UnauthorizedException('OIDC authentication was not completed');
    }

    const oidcClient = await this.getOidcClient();
    const tokens = await oidcClient.authorizationCodeGrant(
      await this.getOidcConfiguration(settings, oidcClient),
      callbackUrl,
      {
        pkceCodeVerifier: state.codeVerifier,
        expectedState: state.state,
        expectedNonce: state.nonce,
      },
    );
    const claims = tokens.claims();
    if (
      !claims ||
      typeof claims.iss !== 'string' ||
      typeof claims.sub !== 'string' ||
      claims.sub.length === 0 ||
      typeof claims.acr !== 'string' ||
      !settings.allowedAcrValues.includes(claims.acr)
    ) {
      throw new UnauthorizedException(
        'Platform sign-in requires an approved MFA assurance level',
      );
    }

    const identity = await this.prisma.platformIdentity.findUnique({
      where: {
        issuer_subject: {
          issuer: claims.iss,
          subject: claims.sub,
        },
      },
      select: { id: true, disabledAt: true },
    });
    if (!identity || identity.disabledAt) {
      throw new UnauthorizedException('Platform identity is not provisioned');
    }

    const sessionToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + PLATFORM_SESSION_TTL_MS);
    await this.prisma.platformSession.create({
      data: {
        identityId: identity.id,
        tokenHash: this.hashSessionToken(sessionToken),
        expiresAt,
      },
    });

    return {
      sessionToken,
      expiresAt,
      frontendCallbackUrl: settings.frontendCallbackUrl,
    };
  }

  async createAccessSession(sessionToken: string | undefined) {
    if (!this.isSessionToken(sessionToken)) {
      throw new UnauthorizedException('Platform session is not active');
    }

    const now = new Date();
    const session = await this.prisma.platformSession.findFirst({
      where: {
        tokenHash: this.hashSessionToken(sessionToken),
        revokedAt: null,
        expiresAt: { gt: now },
        identity: { disabledAt: null },
      },
      include: {
        identity: {
          select: { id: true, role: true },
        },
      },
    });
    if (!session) {
      throw new UnauthorizedException('Platform session is not active');
    }

    return {
      accessToken: await this.authTokens.issuePlatformAccessToken(
        session.identity.id,
        session.id,
      ),
      session: {
        scope: 'platform' as const,
        userId: session.identity.id,
        platformIdentityId: session.identity.id,
        role: session.identity.role,
        permissions: permissionsForPlatformRole(session.identity.role),
      },
    };
  }

  async revokeSession(sessionToken: string | undefined) {
    if (!this.isSessionToken(sessionToken)) return;

    await this.prisma.platformSession.updateMany({
      where: {
        tokenHash: this.hashSessionToken(sessionToken),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  getFrontendCallbackUrl() {
    return this.getSettings().frontendCallbackUrl;
  }

  private getSettings(): PlatformOidcSettings {
    const {
      PLATFORM_OIDC_ISSUER: issuer,
      PLATFORM_OIDC_CLIENT_ID: clientId,
      PLATFORM_OIDC_CLIENT_SECRET: clientSecret,
      PLATFORM_OIDC_CALLBACK_URL: callbackUrl,
      PLATFORM_OIDC_FRONTEND_CALLBACK_URL: frontendCallbackUrl,
      PLATFORM_OIDC_STATE_HMAC_SECRET: stateHmacSecret,
      PLATFORM_OIDC_ALLOWED_ACR_VALUES: acrValueList,
    } = process.env;
    const allowedAcrValues = acrValueList
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (
      !issuer ||
      !clientId ||
      !clientSecret ||
      !callbackUrl ||
      !frontendCallbackUrl ||
      !stateHmacSecret ||
      stateHmacSecret.length < 32 ||
      !allowedAcrValues?.length
    ) {
      throw new ServiceUnavailableException('Platform OIDC is not configured');
    }

    return {
      issuer,
      clientId,
      clientSecret,
      callbackUrl,
      frontendCallbackUrl,
      stateHmacSecret,
      allowedAcrValues,
    };
  }

  private getOidcClient() {
    if (!this.oidcClient) {
      this.oidcClient = this.loadOidcClient().catch((error: unknown) => {
        this.oidcClient = undefined;
        throw error;
      });
    }
    return this.oidcClient;
  }

  private getOidcConfiguration(
    settings: PlatformOidcSettings,
    oidcClient: OpenIdClientApi,
  ) {
    if (!this.oidcConfiguration) {
      const issuerUrl = new URL(settings.issuer);
      let discoveryOptions:
        | Parameters<typeof oidcClient.discovery>[4]
        | undefined;

      if (issuerUrl.protocol === 'http:') {
        const isLoopbackIssuer = ['localhost', '127.0.0.1', '[::1]'].includes(
          issuerUrl.hostname,
        );
        if (process.env.NODE_ENV === 'production' || !isLoopbackIssuer) {
          throw new ServiceUnavailableException(
            'Platform OIDC requires HTTPS except for loopback development issuers',
          );
        }
        discoveryOptions = {
          execute: [oidcClient.allowInsecureRequests],
        };
      }

      this.oidcConfiguration = oidcClient
        .discovery(
          issuerUrl,
          settings.clientId,
          { client_secret: settings.clientSecret },
          oidcClient.ClientSecretBasic(settings.clientSecret),
          ...(discoveryOptions ? [discoveryOptions] : []),
        )
        .catch((error: unknown) => {
          this.oidcConfiguration = undefined;
          throw error;
        });
    }
    return this.oidcConfiguration;
  }

  private signState(state: OidcState, secret: string) {
    const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
    const signature = createHmac('sha256', secret)
      .update(payload)
      .digest('base64url');
    return `${payload}.${signature}`;
  }

  private verifyState(
    cookie: string | undefined,
    secret: string,
    now: number,
  ): OidcState {
    if (!cookie || cookie.length > 4096) {
      throw new UnauthorizedException('Invalid OIDC state');
    }
    const [payload, signature, extra] = cookie.split('.');
    if (
      !payload ||
      !signature ||
      extra !== undefined ||
      !/^[A-Za-z0-9_-]+$/.test(payload) ||
      !/^[A-Za-z0-9_-]+$/.test(signature)
    ) {
      throw new UnauthorizedException('Invalid OIDC state');
    }
    const expectedSignature = createHmac('sha256', secret)
      .update(payload)
      .digest('base64url');
    const expectedBytes = Buffer.from(expectedSignature);
    const actualBytes = Buffer.from(signature);
    if (
      actualBytes.length !== expectedBytes.length ||
      !timingSafeEqual(actualBytes, expectedBytes)
    ) {
      throw new UnauthorizedException('Invalid OIDC state');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      throw new UnauthorizedException('Invalid OIDC state');
    }
    if (
      !isOidcState(parsed) ||
      !parsed.state ||
      !parsed.nonce ||
      !parsed.codeVerifier ||
      parsed.issuedAt > now + 30_000 ||
      now - parsed.issuedAt > OIDC_STATE_TTL_MS
    ) {
      throw new UnauthorizedException('Invalid OIDC state');
    }
    return parsed;
  }

  private isSessionToken(value: string | undefined): value is string {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
  }

  private hashSessionToken(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
