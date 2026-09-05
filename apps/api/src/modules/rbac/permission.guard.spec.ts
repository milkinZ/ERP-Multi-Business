import { Reflector } from '@nestjs/core';

import { PERMISSIONS_KEY } from '../../common/decorator/permissions.decorator';
import { PermissionGuard } from './permission.guard';

function context(user: unknown) {
  return {
    getHandler: () => 'handler',
    getClass: () => 'controller',
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as never;
}

describe('PermissionGuard', () => {
  const getAllAndOverride = jest.fn();
  const reflector = { getAllAndOverride } as unknown as Reflector;
  let guard: PermissionGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new PermissionGuard(reflector);
  });

  it('allows public metadata-free handlers', () => {
    getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(context(undefined))).toBe(true);
  });

  it('denies missing, malformed, and insufficient claims', () => {
    getAllAndOverride.mockReturnValue(['product.read']);

    expect(guard.canActivate(context(undefined))).toBe(false);
    expect(guard.canActivate(context({ permissions: 'product.read' }))).toBe(
      false,
    );
    expect(guard.canActivate(context({ permissions: ['order.read'] }))).toBe(
      false,
    );
  });

  it('requires all permissions declared by the protected endpoint', () => {
    getAllAndOverride.mockReturnValue(['product.read', 'product.create']);

    expect(
      guard.canActivate(
        context({ permissions: ['product.read', 'product.create'] }),
      ),
    ).toBe(true);
    expect(getAllAndOverride).toHaveBeenCalledWith(PERMISSIONS_KEY, [
      'handler',
      'controller',
    ]);
  });
});
