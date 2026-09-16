import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CsrfRefreshGuard } from './csrf-refresh.guard';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from './security.constants';

describe('CsrfRefreshGuard', () => {
  const guard = new CsrfRefreshGuard({} as ConfigService);

  const contextFor = (request: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  it('allows matching cookie and header tokens', () => {
    const request = {
      cookies: { [CSRF_COOKIE_NAME]: 'csrf-a' },
      headers: { [CSRF_HEADER_NAME]: 'csrf-a' },
    };

    expect(guard.canActivate(contextFor(request))).toBe(true);
  });

  it.each([
    { cookies: {}, headers: { [CSRF_HEADER_NAME]: 'csrf-a' } },
    { cookies: { [CSRF_COOKIE_NAME]: 'csrf-a' }, headers: {} },
    {
      cookies: { [CSRF_COOKIE_NAME]: 'csrf-a' },
      headers: { [CSRF_HEADER_NAME]: 'csrf-b' },
    },
  ])('rejects incomplete or mismatched token pairs', (request) => {
    expect(() => guard.canActivate(contextFor(request))).toThrow(
      'CSRF validation failed',
    );
  });
});
