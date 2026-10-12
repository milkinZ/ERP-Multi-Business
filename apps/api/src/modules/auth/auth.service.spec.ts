import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { TenantStatus } from '@prisma/client';

import { testIds, userFixture } from '../../test/factories';
import { requestContext } from '../../core/request-context/request-context';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({ compare: jest.fn(), hash: jest.fn() }));

describe('AuthService', () => {
  const users = { findByEmail: jest.fn(), create: jest.fn() };
  const prisma = {
    tenant: { findUnique: jest.fn() },
    userRole: { findFirst: jest.fn(), create: jest.fn() },
    userOutlet: { findFirst: jest.fn(), create: jest.fn() },
  };
  const authTokens = {
    buildAccessPayload: jest.fn(),
    issueAccessToken: jest.fn(),
    createRefreshTokenPlain: jest.fn(),
    hashRefreshToken: jest.fn(),
  };
  const refreshTokens = {
    create: jest.fn(),
    getBySelector: jest.fn(),
    getBySelectorForAuthentication: jest.fn(),
    revokeById: jest.fn(),
  };
  const sessions = { create: jest.fn() };
  const rotation = { rotate: jest.fn() };
  const selectors = { createSelector: jest.fn() };
  const secretHasher = { verifySecret: jest.fn() };
  const response = { cookie: jest.fn(), clearCookie: jest.fn() };
  let service: AuthService;

  const validRefreshTokenRow = () => ({
    id: 'token-id',
    tokenSelector: 'selector',
    tokenHash: 'secret-hash',
    userId: testIds.user,
    tenantId: testIds.tenant,
    roleId: testIds.role,
    outletId: testIds.outlet,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.tenant.findUnique.mockResolvedValue({ status: TenantStatus.ACTIVE });
    service = new AuthService(
      users as never,
      prisma as never,
      authTokens as never,
      refreshTokens as never,
      sessions as never,
      rotation as never,
      selectors,
      secretHasher as never,
    );
  });

  it('does not reveal whether a login email exists', async () => {
    users.findByEmail.mockResolvedValue(null);

    await expect(
      service.login('missing@example.test', 'not-a-secret', response as never),
    ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it('rejects an invalid password without issuing credentials', async () => {
    users.findByEmail.mockResolvedValue(userFixture());
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login('user-a@example.test', 'not-a-secret', response as never),
    ).rejects.toThrow(UnauthorizedException);
    expect(authTokens.issueAccessToken).not.toHaveBeenCalled();
  });

  it('issues session credentials using tenant and outlet only from stored user context', async () => {
    users.findByEmail.mockResolvedValue(userFixture());
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    prisma.userRole.findFirst.mockResolvedValue({ roleId: testIds.role });
    prisma.userOutlet.findFirst.mockResolvedValue({ outletId: testIds.outlet });
    authTokens.buildAccessPayload.mockResolvedValue({ sub: testIds.user });
    authTokens.issueAccessToken.mockResolvedValue('access-token');
    authTokens.createRefreshTokenPlain
      .mockReturnValueOnce('refresh-secret')
      .mockReturnValueOnce('csrf-token')
      .mockReturnValueOnce('session-id');
    selectors.createSelector.mockReturnValue('selector');
    authTokens.hashRefreshToken.mockResolvedValue('refresh-hash');

    await expect(
      service.login(
        'user-a@example.test',
        'correct-password',
        response as never,
      ),
    ).resolves.toEqual({ accessToken: 'access-token' });
    expect(authTokens.buildAccessPayload).toHaveBeenCalledWith({
      userId: testIds.user,
      tenantId: testIds.tenant,
      outletId: testIds.outlet,
    });
    expect(refreshTokens.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: testIds.tenant,
        roleId: testIds.role,
        outletId: testIds.outlet,
      }),
    );
    expect(response.cookie).toHaveBeenCalledTimes(2);
    expect(response.cookie).toHaveBeenNthCalledWith(
      1,
      'refresh_token',
      'selector.refresh-secret',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/auth',
      }),
    );
    expect(response.cookie).toHaveBeenNthCalledWith(
      2,
      'refresh_csrf',
      'csrf-token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/auth',
      }),
    );
  });

  it('refuses login for a suspended tenant before issuing session credentials', async () => {
    users.findByEmail.mockResolvedValue(userFixture());
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    prisma.tenant.findUnique.mockResolvedValue({
      status: TenantStatus.SUSPENDED,
    });

    await expect(
      service.login(
        'user-a@example.test',
        'correct-password',
        response as never,
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(authTokens.issueAccessToken).not.toHaveBeenCalled();
    expect(refreshTokens.create).not.toHaveBeenCalled();
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it('rejects malformed refresh input before accessing token storage', async () => {
    await expect(
      service.refresh('malformed', 'csrf', response as never),
    ).rejects.toThrow(UnauthorizedException);
    expect(refreshTokens.getBySelector).not.toHaveBeenCalled();
  });

  it('requires both refresh and CSRF tokens', async () => {
    await expect(
      service.refresh('', 'csrf', response as never),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.refresh('selector.secret', '', response as never),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('validates a refresh secret before using its tenant context', async () => {
    refreshTokens.getBySelectorForAuthentication.mockResolvedValue(
      validRefreshTokenRow(),
    );
    secretHasher.verifySecret.mockResolvedValue(true);
    authTokens.buildAccessPayload.mockImplementation(() => {
      expect(requestContext.get().tenantId).toBe(testIds.tenant);
      return { sub: testIds.user };
    });
    authTokens.issueAccessToken.mockResolvedValue('access-token');
    authTokens.createRefreshTokenPlain.mockReturnValue('new-secret');
    rotation.rotate.mockResolvedValue({
      newTokenSelector: 'new-selector',
      newTokenPlain: 'new-secret',
      newTokenId: 'new-token-id',
    });

    const result = await requestContext.run({}, () =>
      service.refresh(
        'selector.refresh-secret',
        'csrf-token',
        response as never,
      ),
    );

    expect(result).toEqual({ accessToken: 'access-token' });
    expect(refreshTokens.getBySelectorForAuthentication).toHaveBeenCalledWith(
      'selector',
    );
    expect(secretHasher.verifySecret).toHaveBeenCalledWith(
      'refresh-secret',
      'secret-hash',
    );
    expect(rotation.rotate).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: testIds.tenant }),
    );
    expect(response.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'new-selector.new-secret',
      expect.objectContaining({ path: '/auth', httpOnly: true }),
    );
  });

  it('refuses refresh for a tenant that is no longer active', async () => {
    refreshTokens.getBySelectorForAuthentication.mockResolvedValue(
      validRefreshTokenRow(),
    );
    secretHasher.verifySecret.mockResolvedValue(true);
    prisma.tenant.findUnique.mockResolvedValue({
      status: TenantStatus.SUSPENDED,
    });

    await expect(
      service.refresh(
        'selector.refresh-secret',
        'csrf-token',
        response as never,
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(authTokens.issueAccessToken).not.toHaveBeenCalled();
    expect(rotation.rotate).not.toHaveBeenCalled();
  });

  it('rejects an invalid refresh secret before tenant-scoped work', async () => {
    refreshTokens.getBySelectorForAuthentication.mockResolvedValue(
      validRefreshTokenRow(),
    );
    secretHasher.verifySecret.mockResolvedValue(false);

    await expect(
      service.refresh('selector.wrong-secret', 'csrf-token', response as never),
    ).rejects.toThrow(UnauthorizedException);

    expect(authTokens.buildAccessPayload).not.toHaveBeenCalled();
    expect(rotation.rotate).not.toHaveBeenCalled();
  });

  it('revokes a matching token on logout and clears both authentication cookies', async () => {
    refreshTokens.getBySelectorForAuthentication.mockResolvedValue(
      validRefreshTokenRow(),
    );
    secretHasher.verifySecret.mockResolvedValue(true);

    await expect(
      service.logout('selector.secret', response as never),
    ).resolves.toEqual({
      success: true,
    });
    expect(refreshTokens.revokeById).toHaveBeenCalledWith(
      'token-id',
      expect.any(Date),
    );
    expect(response.clearCookie).toHaveBeenCalledTimes(3);
    expect(response.clearCookie).toHaveBeenCalledWith('refresh_token', {
      path: '/auth',
    });
    expect(response.clearCookie).toHaveBeenCalledWith('refresh_csrf', {
      path: '/',
    });
  });
});
