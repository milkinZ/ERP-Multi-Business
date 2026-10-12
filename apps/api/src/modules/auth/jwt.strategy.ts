import { Injectable, UnauthorizedException } from '@nestjs/common';

import { PassportStrategy } from '@nestjs/passport';

import { ExtractJwt, Strategy } from 'passport-jwt';
import { TenantStatus } from '@prisma/client';

import { JwtUser } from '../../common/interfaces/jwt-user.interface';
import { PrismaService } from '../../core/database/prisma.service';
import { requestContext } from '../../core/request-context/request-context';

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

  async validate(payload: unknown): Promise<JwtUser> {
    const p = payload as {
      sub: string;
      tenantId: string;
      roleId: string;
      outletId?: string | null;
      permissions: string[];
    };

    return requestContext.run({ tenantId: p.tenantId }, async () => {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: p.tenantId },
        select: { status: true },
      });
      if (!tenant || tenant.status !== TenantStatus.ACTIVE) {
        throw new UnauthorizedException('Tenant is not active');
      }

      return {
        userId: p.sub,
        tenantId: p.tenantId,
        roleId: p.roleId,
        outletId: p.outletId ?? null,
        permissions: p.permissions,
      };
    });
  }
}
