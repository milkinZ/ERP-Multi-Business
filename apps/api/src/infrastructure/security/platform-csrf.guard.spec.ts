import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

import {
  PLATFORM_CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
} from './security.constants';
import { PlatformCsrfGuard } from './platform-csrf.guard';

describe('PlatformCsrfGuard', () => {
  const guard = new PlatformCsrfGuard();

  function contextFor(request: {
    cookies?: Record<string, unknown>;
    headers?: Record<string, string | string[] | undefined>;
  }) {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  it('accepts matching platform double-submit tokens', () => {
    expect(
      guard.canActivate(
        contextFor({
          cookies: { [PLATFORM_CSRF_COOKIE_NAME]: 'csrf-token' },
          headers: { [CSRF_HEADER_NAME]: 'csrf-token' },
        }),
      ),
    ).toBe(true);
  });

  it.each([
    {},
    {
      cookies: { [PLATFORM_CSRF_COOKIE_NAME]: 'csrf-token' },
      headers: { [CSRF_HEADER_NAME]: 'different-token' },
    },
    {
      cookies: { [PLATFORM_CSRF_COOKIE_NAME]: 'csrf-token' },
      headers: { [CSRF_HEADER_NAME]: ['csrf-token'] },
    },
  ])('rejects missing or mismatched platform CSRF tokens', (request) => {
    expect(() => guard.canActivate(contextFor(request))).toThrow(
      new UnauthorizedException('CSRF validation failed'),
    );
  });
});
