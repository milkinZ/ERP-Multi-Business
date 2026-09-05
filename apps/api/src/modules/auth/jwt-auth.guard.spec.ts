import { UnauthorizedException } from '@nestjs/common';

import { requestContext } from '../../core/request-context/request-context';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  it('rejects an authentication error', () => {
    const guard = new JwtAuthGuard();
    const error = new UnauthorizedException('invalid token');

    expect(() => guard.handleRequest(error, undefined as never)).toThrow(error);
  });

  it('rejects a missing authenticated user with UnauthorizedException', () => {
    const guard = new JwtAuthGuard();

    expect(() => guard.handleRequest(null, null as never)).toThrow(
      new UnauthorizedException('Authentication required'),
    );
  });

  it('records only trusted JWT identity fields in request context', () => {
    const guard = new JwtAuthGuard();
    const user = {
      userId: 'user-a',
      tenantId: 'tenant-a',
      outletId: 'outlet-a',
      permissions: ['orders.read'],
    };

    requestContext.run({}, () => {
      expect(guard.handleRequest(null, user)).toBe(user);
      expect(requestContext.get()).toMatchObject({
        userId: 'user-a',
        tenantId: 'tenant-a',
        outletId: 'outlet-a',
      });
    });
  });
});
