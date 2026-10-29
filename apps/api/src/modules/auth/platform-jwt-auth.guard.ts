import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import type { PlatformJwtUser } from '../../common/interfaces/jwt-user.interface';
import { requestContext } from '../../core/request-context/request-context';

@Injectable()
export class PlatformJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = PlatformJwtUser>(err: unknown, user: TUser): TUser {
    if (err) {
      if (err instanceof Error) throw err;
      throw new UnauthorizedException('Authentication failed');
    }
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    const platformUser = user as unknown as PlatformJwtUser;
    if (platformUser.scope !== 'platform' || !platformUser.platformIdentityId) {
      throw new UnauthorizedException('Platform authentication required');
    }

    requestContext.set({
      userId: platformUser.userId,
      tenantId: undefined,
      outletId: undefined,
      platformIdentityId: platformUser.platformIdentityId,
    });
    return user;
  }
}
