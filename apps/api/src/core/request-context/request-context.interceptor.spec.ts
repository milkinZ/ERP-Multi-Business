import { CallHandler, ExecutionContext } from '@nestjs/common';
import { defer, lastValueFrom, of } from 'rxjs';

import { RequestContextInterceptor } from './request-context.interceptor';
import { requestContext } from './request-context';

describe('RequestContextInterceptor', () => {
  it('runs the request subscription with the authenticated tenant context', async () => {
    const interceptor = new RequestContextInterceptor();
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            scope: 'tenant',
            userId: 'user-a',
            tenantId: 'tenant-a',
            outletId: 'outlet-a',
          },
        }),
      }),
    } as unknown as ExecutionContext;
    const next = {
      handle: () =>
        defer(() =>
          of({
            ...requestContext.get(),
          }),
        ),
    } as CallHandler;

    const response = requestContext.run({ requestId: 'request-a' }, () =>
      interceptor.intercept(context, next),
    );

    await expect(lastValueFrom(response)).resolves.toMatchObject({
      requestId: 'request-a',
      userId: 'user-a',
      tenantId: 'tenant-a',
      outletId: 'outlet-a',
    });
    expect(requestContext.get().tenantId).toBeUndefined();
  });

  it('clears tenant context for platform identities', async () => {
    const interceptor = new RequestContextInterceptor();
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            scope: 'platform',
            userId: 'platform-user',
            platformIdentityId: 'platform-a',
          },
        }),
      }),
    } as unknown as ExecutionContext;
    const next = {
      handle: () => defer(() => of(requestContext.get())),
    } as CallHandler;

    const response = requestContext.run(
      { requestId: 'request-a', tenantId: 'untrusted-tenant' },
      () => interceptor.intercept(context, next),
    );

    await expect(lastValueFrom(response)).resolves.toMatchObject({
      requestId: 'request-a',
      userId: 'platform-user',
      tenantId: undefined,
      platformIdentityId: 'platform-a',
    });
  });
});
