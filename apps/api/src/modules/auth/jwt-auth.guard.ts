import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { requestContext } from '../../core/request-context/request-context';
import { JwtUser } from '../../common/interfaces/jwt-user.interface';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = JwtUser>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      throw err;
    }

    const jwtUser = user as unknown as JwtUser;

    requestContext.set({
      userId: jwtUser.userId,
      tenantId: jwtUser.tenantId,
      outletId: jwtUser.outletId,
    });
    return user;
  }
}
