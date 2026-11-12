import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

import { requestContext } from './request-context';
import type {
  JwtUser,
  PlatformJwtUser,
} from '../../common/interfaces/jwt-user.interface';

type RequestWithUser = {
  user?: JwtUser | PlatformJwtUser;
};

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    const store = { ...requestContext.get() };

    if (user?.scope === 'platform') {
      Object.assign(store, {
        userId: user.userId,
        tenantId: undefined,
        outletId: undefined,
        platformIdentityId: user.platformIdentityId,
      });
    } else if (user?.tenantId) {
      Object.assign(store, {
        userId: user.userId,
        tenantId: user.tenantId,
        outletId: user.outletId,
        platformIdentityId: undefined,
      });
    }

    return new Observable((subscriber) =>
      requestContext.run(store, () => next.handle().subscribe(subscriber)),
    );
  }
}
