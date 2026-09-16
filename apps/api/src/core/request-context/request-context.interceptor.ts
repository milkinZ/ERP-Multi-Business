import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

import { requestContext } from './request-context';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';

type RequestWithUser = {
  user?: JwtUser;
};

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const request = context.switchToHttp().getRequest<RequestWithUser>();
      const user = request.user;

      if (user?.tenantId) {
        requestContext.set({
          userId: user.userId,
          tenantId: user.tenantId,
          outletId: user.outletId,
        });
      }
    }

    return next.handle();
  }
}
