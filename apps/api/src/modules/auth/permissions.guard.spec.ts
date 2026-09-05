import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PermissionsGuard } from './permissions.guard';

function executionContext(user?: unknown): ExecutionContext {
  return {
    getHandler: () => 'handler',
    getClass: () => 'controller',
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const getAllAndOverride = jest.fn();
  const reflector = { getAllAndOverride } as unknown as Reflector;
  let guard: PermissionsGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new PermissionsGuard(reflector);
  });

  it('allows endpoints without permission metadata', () => {
    getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(executionContext())).toBe(true);
  });

  it('rejects an unauthenticated request for a protected endpoint', () => {
    getAllAndOverride.mockReturnValue(['orders.read']);

    expect(() => guard.canActivate(executionContext())).toThrow(
      new ForbiddenException('No permissions found'),
    );
  });

  it('rejects malformed permission claims instead of trusting client input', () => {
    getAllAndOverride.mockReturnValue(['orders.read']);

    expect(() =>
      guard.canActivate(executionContext({ permissions: ['orders.read', 7] })),
    ).toThrow('No permissions found');
  });

  it('rejects a user missing any required permission', () => {
    getAllAndOverride.mockReturnValue(['orders.read', 'orders.update']);

    expect(
      guard.canActivate(executionContext({ permissions: ['orders.read'] })),
    ).toBe(false);
  });

  it('requires every declared permission', () => {
    getAllAndOverride.mockReturnValue(['orders.read', 'orders.update']);

    expect(
      guard.canActivate(
        executionContext({ permissions: ['orders.read', 'orders.update'] }),
      ),
    ).toBe(true);
  });
});
