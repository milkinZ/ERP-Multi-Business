import { Injectable } from '@nestjs/common';

import { PassportStrategy } from '@nestjs/passport';

import { ExtractJwt, Strategy } from 'passport-jwt';

import { JwtUser } from '../../common/interfaces/jwt-user.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
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

  validate(payload: unknown): JwtUser {
    const p = payload as {
      sub: string;
      tenantId: string;
      roleId: string;
      outletId?: string | null;
      permissions: string[];
    };

    return {
      userId: p.sub,
      tenantId: p.tenantId,
      roleId: p.roleId,
      outletId: p.outletId ?? null,
      permissions: p.permissions,
    };
  }
}
