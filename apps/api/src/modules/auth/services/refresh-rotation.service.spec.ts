import { UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';
import { RefreshRotationService } from './refresh-rotation.service';

type ConsumeRefreshTokenArgs = {
  where: {
    id: string;
    tokenSelector: string;
    tokenHash: string;
    userId: string;
    tenantId: string;
    revokedAt: null;
    expiresAt: { gt: Date };
  };
  data: { revokedAt: Date };
};

type CreateRefreshTokenArgs = {
  data: {
    tokenSelector: string;
    tokenHash: string;
    userId: string;
    tenantId: string;
    roleId: string;
    outletId: string | null;
    expiresAt: Date;
    rotatedFromId: string;
  };
};

describe('RefreshRotationService', () => {
  const oldToken = {
    id: 'old-token-id',
    tokenSelector: 'old-selector',
    tokenHash: 'old-hash',
    userId: 'user-a',
    tenantId: 'tenant-a',
    roleId: 'role-a',
    outletId: null,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
  };

  function createService(consumedCount = 1) {
    const transaction = {
      refreshToken: {
        updateMany: jest.fn((args: ConsumeRefreshTokenArgs) =>
          Promise.resolve({
            count:
              args.where.revokedAt === null &&
              args.where.expiresAt.gt instanceof Date
                ? consumedCount
                : 0,
          }),
        ),
        create: jest.fn((args: CreateRefreshTokenArgs) =>
          Promise.resolve({
            id:
              args.data.rotatedFromId === oldToken.id
                ? 'new-token-id'
                : 'unexpected-token-id',
          }),
        ),
      },
    };
    const prisma = {
      refreshToken: {
        findUnique: jest.fn().mockResolvedValue(oldToken),
      },
      $transaction: jest.fn(
        (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const selectors = {
      createSelector: jest.fn().mockReturnValue('new-selector'),
    };
    const secretHasher = {
      verifySecret: jest.fn().mockResolvedValue(true),
      hashSecret: jest.fn().mockResolvedValue('new-hash'),
    };
    const service = new RefreshRotationService(
      prisma as unknown as PrismaService,
      selectors,
      secretHasher,
    );

    return { service, transaction, prisma };
  }

  const params = {
    userId: oldToken.userId,
    tenantId: oldToken.tenantId,
    oldTokenSelector: oldToken.tokenSelector,
    oldTokenSecret: 'old-secret',
    newTokenPlain: 'new-secret',
    newExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };

  it('atomically consumes the old token before creating its successor', async () => {
    const { service, transaction, prisma } = createService();

    await expect(service.rotate(params)).resolves.toEqual({
      newTokenPlain: params.newTokenPlain,
      newTokenSelector: 'new-selector',
      newTokenId: 'new-token-id',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const consumeArgs = transaction.refreshToken.updateMany.mock.calls[0]?.[0];
    expect(consumeArgs?.where).toMatchObject({
      id: oldToken.id,
      tokenSelector: oldToken.tokenSelector,
      tokenHash: oldToken.tokenHash,
      userId: oldToken.userId,
      tenantId: oldToken.tenantId,
      revokedAt: null,
    });
    expect(consumeArgs?.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(consumeArgs?.data.revokedAt).toBeInstanceOf(Date);

    const createArgs = transaction.refreshToken.create.mock.calls[0]?.[0];
    expect(createArgs?.data).toMatchObject({
      tokenSelector: 'new-selector',
      tokenHash: 'new-hash',
      rotatedFromId: oldToken.id,
    });
  });

  it('rejects a token already consumed by a concurrent rotation', async () => {
    const { service, transaction } = createService(0);

    await expect(service.rotate(params)).rejects.toThrow(
      new UnauthorizedException('Invalid refresh token'),
    );
    expect(transaction.refreshToken.create).not.toHaveBeenCalled();
  });
});
