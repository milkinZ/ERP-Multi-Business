import { Injectable, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';

import { RefreshTokensService } from './refresh-tokens.service';
import { RefreshTokenSelectorsService } from './refresh-token-selectors.service';
import { RefreshSecretHashService } from './refresh-secret-hash.service';

@Injectable()
export class RefreshRotationService {
  constructor(
    private prisma: PrismaService,
    private refreshTokens: RefreshTokensService,
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

    const revokedAt = new Date();
    await this.refreshTokens.revokeById(oldTokenRow.id, revokedAt);

    const newSelector = this.selectors.createSelector();
    const newHash = await this.secretHasher.hashSecret(newTokenPlain);

    const newToken = await this.refreshTokens.create({
      tokenSelector: newSelector,
      tokenHash: newHash,
      userId: oldTokenRow.userId,
      tenantId: oldTokenRow.tenantId,
      roleId: oldTokenRow.roleId,
      outletId: oldTokenRow.outletId ?? null,
      expiresAt: newExpiresAt,
      rotatedFromId: oldTokenRow.id,
    });

    return {
      newTokenPlain,
      newTokenId: newToken.id,
    };
  }
}
