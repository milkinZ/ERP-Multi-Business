import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';

import type { Prisma } from '@prisma/client';

@Injectable()
export class RefreshTokensService {
  constructor(private prisma: PrismaService) {}

  getByHash(hash: string) {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash: hash },
    });
  }

  getBySelector(selector: string) {
    return this.prisma.refreshToken.findUnique({
      where: { tokenSelector: selector },
    });
  }

  async create(data: Prisma.RefreshTokenUncheckedCreateInput) {
    return this.prisma.refreshToken.create({ data });
  }

  async revokeById(id: string, revokedAt: Date) {
    return this.prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt },
    });
  }

  async revokeAllForUser(userId: string, revokedAt: Date) {
    return this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt },
    });
  }
}
