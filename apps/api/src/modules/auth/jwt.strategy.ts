import { Injectable, UnauthorizedException } from '@nestjs/common';

import { PassportStrategy } from '@nestjs/passport';

import { ExtractJwt, Strategy } from 'passport-jwt';
import { TenantStatus } from '@prisma/client';

import {
  JwtUser,
  PlatformJwtUser,
} from '../../common/interfaces/jwt-user.interface';
import { PrismaService } from '../../core/database/prisma.service';
import { requestContext } from '../../core/request-context/request-context';
import { isTenantAssignablePermission } from '../rbac/tenant-permissions';
import { permissionsForPlatformRole } from './platform-role-permissions';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not defined');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: unknown): Promise<JwtUser | PlatformJwtUser> {
    const p = payload as {
      sub: string;
      scope?: string;
      platformSessionId?: string;
      tenantId?: string;
      roleId?: string;
      sessionId?: string;
      outletId?: string | null;
      permissions?: unknown;
    };

    if (p.scope === 'platform') {
      if (!p.sub || !p.platformSessionId) {
        throw new UnauthorizedException('Invalid platform session');
      }

      return requestContext.run({ platformIdentityId: p.sub }, async () => {
        const [identity, session] = await Promise.all([
          this.prisma.platformIdentity.findFirst({
            where: { id: p.sub, disabledAt: null },
            select: { id: true, role: true },
          }),
          this.prisma.platformSession.findFirst({
            where: {
              id: p.platformSessionId,
              identityId: p.sub,
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
            select: { id: true },
          }),
        ]);
        if (!identity || !session) {
          throw new UnauthorizedException('Platform session is not active');
        }

        return {
          scope: 'platform',
          userId: identity.id,
          platformIdentityId: identity.id,
          permissions: permissionsForPlatformRole(identity.role),
        };
      });
    }

    if (p.scope !== undefined && p.scope !== 'tenant') {
      throw new UnauthorizedException('Invalid token scope');
    }

    const tenantId = p.tenantId;
    const userId = p.sub;
    const sessionId = p.sessionId;
    if (!tenantId || !userId || !sessionId) {
      throw new UnauthorizedException('Invalid tenant session');
    }

    return requestContext.run({ tenantId, userId, sessionId }, async () => {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { status: true },
      });
      if (!tenant || tenant.status !== TenantStatus.ACTIVE) {
        throw new UnauthorizedException('Tenant is not active');
      }
      const user = await this.prisma.user.findFirst({
        where: { id: userId, tenantId, deletedAt: null },
        select: { id: true, isActive: true },
      });
      if (!user || !user.isActive) {
        throw new UnauthorizedException('User is not active');
      }

      const session = await this.prisma.session.findFirst({
        where: { sessionId, userId, tenantId, deletedAt: null },
        select: { outletId: true },
      });
      if (!session) {
        throw new UnauthorizedException('Tenant session is not active');
      }

      const userRoles = await this.prisma.userRole.findMany({
        where: { userId, tenantId, deletedAt: null, role: { tenantId } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: {
          role: {
            include: {
              RolePermission: { include: { Permission: true } },
            },
          },
        },
      });
      if (!userRoles.length) {
        throw new UnauthorizedException('No role assigned');
      }

      const userOutlets = await this.prisma.userOutlet.findMany({
        where: {
          userId,
          tenantId,
          deletedAt: null,
          outlet: { tenantId, deletedAt: null },
        },
        select: { outletId: true },
      });
      if (
        session.outletId &&
        !userOutlets.some((outlet) => outlet.outletId === session.outletId)
      ) {
        throw new UnauthorizedException(
          'Session outlet assignment is inactive',
        );
      }

      const roleIds = [...new Set(userRoles.map(({ roleId }) => roleId))];
      const roleId = roleIds[0];
      if (!roleId) {
        throw new UnauthorizedException('No role assigned');
      }

      return {
        scope: 'tenant',
        userId,
        tenantId,
        roleId,
        sessionId,
        outletId: session.outletId,
        roles: roleIds,
        outlets: userOutlets.map(({ outletId }) => outletId),
        permissions: [
          ...new Set(
            userRoles.flatMap((userRole) =>
              userRole.role.RolePermission.map(
                ({ Permission }) => Permission.code,
              ).filter(isTenantAssignablePermission),
            ),
          ),
        ],
      };
    });
  }
}
