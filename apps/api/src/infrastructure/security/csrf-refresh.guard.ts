import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from './security.constants';

type HttpRequestLike = {
  cookies?: Record<string, unknown>;
  headers?: Record<string, unknown>;
};

@Injectable()
export class CsrfRefreshGuard implements CanActivate {
  constructor(private readonly _config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<HttpRequestLike>();

    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
    const headerToken = req.headers?.[CSRF_HEADER_NAME];

    console.log('cookies', req.cookies);
    console.log('headers', req.headers);

    if (typeof cookieToken !== 'string') {
      throw new UnauthorizedException('CSRF validation failed');
    }

    if (typeof headerToken !== 'string') {
      throw new UnauthorizedException('CSRF validation failed');
    }

    if (headerToken !== cookieToken) {
      throw new UnauthorizedException('CSRF validation failed');
    }

    return true;
  }
}
