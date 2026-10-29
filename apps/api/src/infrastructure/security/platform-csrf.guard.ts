import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

import {
  PLATFORM_CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
} from './security.constants';

type HttpRequestLike = {
  cookies?: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
};

@Injectable()
export class PlatformCsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<HttpRequestLike>();
    const cookieToken = request.cookies?.[PLATFORM_CSRF_COOKIE_NAME];
    const headerToken = request.headers?.[CSRF_HEADER_NAME];

    if (
      typeof cookieToken !== 'string' ||
      typeof headerToken !== 'string' ||
      cookieToken.length === 0 ||
      cookieToken.length !== headerToken.length ||
      !timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))
    ) {
      throw new UnauthorizedException('CSRF validation failed');
    }

    return true;
  }
}
