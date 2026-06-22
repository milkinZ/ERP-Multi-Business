import { Injectable } from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import * as crypto from 'node:crypto';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../../core/database/prisma.service';

import type { JwtAccessPayload } from '../interfaces/jwt-access-payload.interface';

@Injectable()
export class AuthTokensService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async issueAccessToken(payload: JwtAccessPayload) {
    // short-lived
    return this.jwtService.signAsync(payload, {
      expiresIn: '15m',
    });
  }

  createRefreshTokenPlain() {
    return crypto.randomBytes(64).toString('hex');
  }

  async hashRefreshToken(plain: string) {
    // bcrypt hash includes salt -> different each time.
    // We rely on tokenHash uniqueness in DB.
    return bcrypt.hash(plain, 10);
  }

  async buildAccessPayload(params: {
    userId: string;

    tenantId: string;
    outletId?: string | null;
  }) {
    const { userId, tenantId, outletId } = params;

    const userRoles = await this.prisma.userRole.findMany({
      where: { userId, tenantId, deletedAt: null },
      include: {
        role: {
          include: {
            RolePermission: {
              include: { Permission: true },
            },
          },
        },
      },
    });

    const permissions = Array.from(
      new Set(
        userRoles.flatMap((ur) =>
          ur.role.RolePermission.map((rp) => rp.Permission.code),
        ),
      ),
    );

    const roleIds = Array.from(new Set(userRoles.map((ur) => ur.roleId)));

    const outlets = outletId ? [outletId] : [];

    const accessPayload: JwtAccessPayload = {
      sub: userId,
      tenantId,
      permissions,
      roles: roleIds,
      outlets,
    };

    return accessPayload;
  }
}
