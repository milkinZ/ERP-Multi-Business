import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';

@Injectable()
export class SessionsService {
  constructor(private prisma: PrismaService) {}

  create(data: {
    sessionId: string;
    userId: string;
    tenantId: string;
    outletId?: string | null;
  }) {
    return this.prisma.session.create({
      data: {
        sessionId: data.sessionId,
        userId: data.userId,
        tenantId: data.tenantId,
        outletId: data.outletId ?? null,
      },
    });
  }

  revokeSession(sessionId: string, revokedAt: Date) {
    // Prisma schema uses deletedAt for soft revoke
    return this.prisma.session.updateMany({
      where: { sessionId, deletedAt: null },
      data: { deletedAt: revokedAt },
    });
  }
}
