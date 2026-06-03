import { Injectable } from '@nestjs/common'

import { PassportStrategy } from '@nestjs/passport'

import {
    ExtractJwt,
    Strategy,
} from 'passport-jwt'

import { JwtUser } from '../../common/interfaces/jwt-user.interface'

@Injectable()
export class JwtStrategy extends PassportStrategy(
    Strategy,
) {
    constructor() {
        const jwtSecret = process.env.JWT_SECRET

        if (!jwtSecret) {
            throw new Error('JWT_SECRET is not defined')
        }

        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: jwtSecret,
        })
    }

    async validate(
        payload: any,
    ): Promise<JwtUser> {
        return {
            userId: payload.sub,
            tenantId: payload.tenantId,
            roleId: payload.roleId,
            outletId: payload.outletId,
            permissions: payload.permissions,
        }
    }
}