import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { FEATURE_MODULE_METADATA } from '../subscription/plans/feature-module.decorator';
import { FeatureModuleGuard } from './feature-module.guard';
import { requestContext } from '../../core/request-context/request-context';

describe('FeatureModuleGuard', () => {
  const getFeatureModuleEntitlement = jest.fn();
  const evaluate = jest.fn();
  const handler = () => undefined;
  const controller = class {};
  const reflector = new Reflector();
  const context = {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({ user: { tenantId: 'tenant-a' } }),
    }),
  };
  const guard = new FeatureModuleGuard(
    reflector,
    { getFeatureModuleEntitlement } as never,
    { evaluate } as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows an entitled module when its operational flag is enabled', async () => {
    Reflect.defineMetadata(FEATURE_MODULE_METADATA, 'INVENTORY', controller);
    getFeatureModuleEntitlement.mockImplementation(() => {
      expect(requestContext.get().tenantId).toBe('tenant-a');
      return Promise.resolve(true);
    });
    evaluate.mockImplementation(() => {
      expect(requestContext.get().tenantId).toBe('tenant-a');
      return Promise.resolve(true);
    });

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(getFeatureModuleEntitlement).toHaveBeenCalledWith(
      'tenant-a',
      'INVENTORY',
    );
    expect(evaluate).toHaveBeenCalledWith('tenant-a', 'INVENTORY');
  });

  it('does not let a tenant flag grant a module missing from the plan', async () => {
    Reflect.defineMetadata(FEATURE_MODULE_METADATA, 'INVENTORY', controller);
    getFeatureModuleEntitlement.mockResolvedValue(false);
    evaluate.mockResolvedValue(true);

    await expect(guard.canActivate(context as never)).rejects.toThrow(
      ForbiddenException,
    );
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('blocks an entitled module disabled by its operational flag', async () => {
    Reflect.defineMetadata(FEATURE_MODULE_METADATA, 'INVENTORY', controller);
    getFeatureModuleEntitlement.mockResolvedValue(true);
    evaluate.mockResolvedValue(false);

    await expect(guard.canActivate(context as never)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('does not change routes without module metadata', async () => {
    Reflect.deleteMetadata(FEATURE_MODULE_METADATA, controller);

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(getFeatureModuleEntitlement).not.toHaveBeenCalled();
  });
});
