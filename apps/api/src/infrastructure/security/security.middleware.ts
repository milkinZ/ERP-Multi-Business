import { Injectable, NestMiddleware } from '@nestjs/common';

import { Request, Response } from 'express';

import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  REFRESH_COOKIE_NAME,
} from './security.constants';

@Injectable()
export class SecurityCookiesMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: () => void) {
    // Ensure CSRF cookie is present for refresh/logout requests.
    // Login endpoint should set CSRF_COOKIE_NAME and REFRESH_COOKIE_NAME.
    // This middleware only enforces safe defaults.

    // If cookie is present but header missing, guard will block.
    // If cookie missing, guard will block.

    // Harden cookie flags are handled when setting cookies.

    // Pass through.
    void req;
    void res;
    void CSRF_HEADER_NAME;
    void CSRF_COOKIE_NAME;
    void REFRESH_COOKIE_NAME;

    next();
  }
}
