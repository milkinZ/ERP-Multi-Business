import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { JwtUser } from '../interfaces/jwt-user.interface';

type RequestWithUser = { user?: JwtUser };

export const CurrentUser = createParamDecorator(
  (data: keyof JwtUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) return undefined;

    return data ? user[data] : user;
  },
);
