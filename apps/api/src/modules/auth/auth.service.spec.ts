import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { testIds, userFixture } from '../../test/factories';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({ compare: jest.fn(), hash: jest.fn() }));

describe('AuthService', () => {
  const users = { findByEmail: jest.fn(), create: jest.fn() };
  const prisma = {
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
    revokeById: jest.fn(),
  };
  const sessions = { create: jest.fn() };
  const rotation = { rotate: jest.fn() };
  const selectors = { createSelector: jest.fn() };
  const response = { cookie: jest.fn(), clearCookie: jest.fn() };
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      users as never,
      prisma as never,
      authTokens as never,
      refreshTokens as never,
      sessions as never,
      rotation as never,
      selectors,
      {} as never,
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

  it('revokes a matching token on logout and clears both authentication cookies', async () => {
    refreshTokens.getBySelector.mockResolvedValue({ id: 'token-id' });

    await expect(
      service.logout('selector.secret', response as never),
    ).resolves.toEqual({
      success: true,
    });
    expect(refreshTokens.revokeById).toHaveBeenCalledWith(
      'token-id',
      expect.any(Date),
    );
    expect(response.clearCookie).toHaveBeenCalledTimes(2);
  });
});
