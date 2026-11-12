import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';

import { PrismaService } from '../../../core/database/prisma.service';
import { PlatformOperationsRealtimeGateway } from './platform-operations-realtime.gateway';

describe('PlatformOperationsRealtimeGateway', () => {
  const secret = 'platform-realtime-test-secret';
  const config = { get: jest.fn().mockReturnValue(secret) };
  const sessionFindFirst = jest.fn(
    (query: {
      where: {
        id: string;
        identityId: string;
        revokedAt: null;
        expiresAt: { gt: Date };
      };
    }) => Promise.resolve({ id: query.where.id }),
  );
  const prisma = {
    platformIdentity: { findFirst: jest.fn() },
    platformSession: { findFirst: sessionFindFirst },
  };
  let gateway: PlatformOperationsRealtimeGateway;

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockReturnValue(secret);
    prisma.platformIdentity.findFirst.mockResolvedValue({ role: 'READ_ONLY' });
    gateway = new PlatformOperationsRealtimeGateway(
      config as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );
  });

  it('accepts a valid platform read-only session and joins the platform room', async () => {
    const token = jwt.sign(
      {
        sub: 'identity-1',
        scope: 'platform',
        platformSessionId: 'session-1',
      },
      secret,
      { expiresIn: '1h' },
    );
    const client = {
      id: 'socket-1',
      connected: true,
      handshake: { auth: { token } },
      data: {},
      join: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
    };

    await gateway.handleConnection(client as never);

    expect(prisma.platformIdentity.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'identity-1', disabledAt: null },
      }),
    );
    const sessionQuery = sessionFindFirst.mock.calls[0]?.[0];
    expect(sessionQuery?.where.id).toBe('session-1');
    expect(sessionQuery?.where.identityId).toBe('identity-1');
    expect(sessionQuery?.where.revokedAt).toBeNull();
    expect(sessionQuery?.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(client.join).toHaveBeenCalledWith('platform:operations');
    expect(client.disconnect).not.toHaveBeenCalled();

    gateway.handleDisconnect(client as never);
  });

  it('rejects a missing or invalid platform token', async () => {
    const client = {
      id: 'socket-2',
      connected: true,
      handshake: { auth: {} },
      data: {},
      join: jest.fn(),
      disconnect: jest.fn(),
    };

    await gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
    expect(prisma.platformIdentity.findFirst).not.toHaveBeenCalled();
  });
});
