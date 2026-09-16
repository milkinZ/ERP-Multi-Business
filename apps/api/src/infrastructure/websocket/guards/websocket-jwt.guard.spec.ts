import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';

import { WebsocketJwtGuard } from './websocket-jwt.guard';

describe('WebsocketJwtGuard', () => {
  const secret = 'test-access-secret';
  const config = {
    get: jest.fn(() => secret),
  } as unknown as ConfigService;
  const guard = new WebsocketJwtGuard(config);

  const contextFor = (socket: Record<string, unknown>) =>
    ({
      switchToWs: () => ({ getClient: () => socket }),
    }) as unknown as ExecutionContext;

  it('rejects a missing token', () => {
    const socket = { handshake: { auth: {}, headers: {} }, data: {} };

    expect(() => guard.canActivate(contextFor(socket))).toThrow(
      new UnauthorizedException('Missing JWT'),
    );
  });

  it('rejects a valid token without required identity claims', () => {
    const token = jwt.sign({ outletId: 'outlet-a' }, secret);
    const socket = {
      handshake: { auth: { token }, headers: {} },
      data: {},
    };

    expect(() => guard.canActivate(contextFor(socket))).toThrow(
      new UnauthorizedException('Invalid or expired JWT'),
    );
  });

  it('stores the authenticated tenant context from a valid token', () => {
    const token = jwt.sign(
      { userId: 'user-a', tenantId: 'tenant-a', outletId: 'outlet-a' },
      secret,
    );
    const socket = {
      handshake: { auth: { token }, headers: {} },
      data: {},
    };

    expect(guard.canActivate(contextFor(socket))).toBe(true);
    expect(socket.data).toEqual({
      ctx: { userId: 'user-a', tenantId: 'tenant-a', outletId: 'outlet-a' },
    });
  });
});
