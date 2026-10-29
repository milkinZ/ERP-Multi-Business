import { Injectable, UnauthorizedException } from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import * as crypto from 'node:crypto';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../../core/database/prisma.service';
import { isTenantAssignablePermission } from '../../rbac/tenant-permissions';

import type { JwtAccessPayload } from '../interfaces/jwt-access-payload.interface';
import { PlatformAdminRole } from '@prisma/client';
import { permissionsForPlatformRole } from '../platform-role-permissions';

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

  async issuePlatformAccessToken(
    platformIdentityId: string,
    platformSessionId: string,
  ) {
    return this.jwtService.signAsync(
      {
        sub: platformIdentityId,
        scope: 'platform',
        platformSessionId,
      },
      { expiresIn: '10m' },
    );
  }

  getPlatformPermissions(role: PlatformAdminRole): string[] {
    return permissionsForPlatformRole(role);
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
    sessionId: string;
    outletId?: string | null;
  }) {
    const { userId, tenantId, sessionId, outletId } = params;

    const userRoles = await this.prisma.userRole.findMany({
      where: { userId, tenantId, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
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
          ur.role.RolePermission.map((rp) => rp.Permission.code).filter(
            isTenantAssignablePermission,
          ),
        ),
      ),
    );

    const roleIds = Array.from(new Set(userRoles.map((ur) => ur.roleId)));
    const roleId = roleIds[0];
    if (!roleId) {
      throw new UnauthorizedException('No role assigned');
    }

    const outlets = outletId ? [outletId] : [];

    const accessPayload: JwtAccessPayload = {
      sub: userId,
      scope: 'tenant',
      tenantId,
      roleId,
      sessionId,
      permissions,
      roles: roleIds,
      outlets,
    };

    return accessPayload;
  }
}
