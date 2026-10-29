import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { requestContext } from '../../core/request-context/request-context';
import {
  JwtUser,
  PlatformJwtUser,
} from '../../common/interfaces/jwt-user.interface';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = JwtUser>(err: unknown, user: TUser): TUser {
    if (err) {
      if (err instanceof Error) {
        throw err;
      }

      throw new UnauthorizedException('Authentication failed');
    }

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    const authenticatedUser = user as unknown as JwtUser | PlatformJwtUser;
    if (authenticatedUser.scope !== 'tenant' || !authenticatedUser.tenantId) {
      throw new UnauthorizedException('Tenant authentication required');
    }

    requestContext.set({
      userId: authenticatedUser.userId,
      tenantId: authenticatedUser.tenantId,
      outletId: authenticatedUser.outletId,
      platformIdentityId: undefined,
    });
    return user;
  }
}
