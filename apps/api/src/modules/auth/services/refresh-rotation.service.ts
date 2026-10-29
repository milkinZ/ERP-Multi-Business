import { Injectable, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';

import { RefreshTokenSelectorsService } from './refresh-token-selectors.service';
import { RefreshSecretHashService } from './refresh-secret-hash.service';

@Injectable()
export class RefreshRotationService {
  constructor(
    private prisma: PrismaService,
    private selectors: RefreshTokenSelectorsService,
    private secretHasher: RefreshSecretHashService,
  ) {}

  async rotate(params: {
    userId: string;
    tenantId: string;
    oldTokenSelector: string;
    oldTokenSecret: string;
    newTokenPlain: string;
    newExpiresAt: Date;
    outletId?: string | null;
  }) {
    const {
      userId,
      tenantId,
      oldTokenSelector,
      oldTokenSecret,
      newTokenPlain,
      newExpiresAt,
    } = params;

    const oldTokenRow = await this.prisma.refreshToken.findUnique({
      where: { tokenSelector: oldTokenSelector },
    });

    if (!oldTokenRow || oldTokenRow.revokedAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (!oldTokenRow.sessionId) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const sessionId = oldTokenRow.sessionId;

    if (oldTokenRow.userId !== userId || oldTokenRow.tenantId !== tenantId) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const secretMatches = await this.secretHasher.verifySecret(
      oldTokenSecret,
      oldTokenRow.tokenHash,
    );

    if (!secretMatches) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const newSelector = this.selectors.createSelector();
    const newHash = await this.secretHasher.hashSecret(newTokenPlain);
    const rotatedAt = new Date();

    const newToken = await this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.refreshToken.updateMany({
        where: {
          id: oldTokenRow.id,
          tokenSelector: oldTokenSelector,
          tokenHash: oldTokenRow.tokenHash,
          userId,
          tenantId,
          revokedAt: null,
          expiresAt: { gt: rotatedAt },
        },
        data: { revokedAt: rotatedAt },
      });

      if (consumed.count !== 1) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const outletId =
        params.outletId === undefined ? oldTokenRow.outletId : params.outletId;
      const updatedSession = await transaction.session.updateMany({
        where: {
          sessionId,
          userId,
          tenantId,
          deletedAt: null,
        },
        data: { outletId },
      });
      if (updatedSession.count !== 1) {
        throw new UnauthorizedException('Tenant session is not active');
      }

      return transaction.refreshToken.create({
        data: {
          tokenSelector: newSelector,
          tokenHash: newHash,
          userId: oldTokenRow.userId,
          tenantId: oldTokenRow.tenantId,
          roleId: oldTokenRow.roleId,
          outletId: outletId ?? null,
          sessionId,
          expiresAt: newExpiresAt,
          rotatedFromId: oldTokenRow.id,
        },
      });
    });

    return {
      newTokenPlain,
      newTokenSelector: newSelector,
      newTokenId: newToken.id,
    };
  }
}
