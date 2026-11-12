import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { requestContext } from '../../core/request-context/request-context';
import { PlanEntitlementsService } from '../subscription/plans/plan-entitlements.service';
import { FEATURE_MODULE_METADATA } from '../subscription/plans/feature-module.decorator';
import type { FeatureModuleKey } from '../subscription/plans/feature-module-keys';
import { FeatureFlagService } from './feature-flag.service';

type AuthenticatedRequest = {
  user?: {
    tenantId?: string;
  };
};

@Injectable()
export class FeatureModuleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly planEntitlements: PlanEntitlementsService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredModule = this.reflector.getAllAndOverride<FeatureModuleKey>(
      FEATURE_MODULE_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredModule) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const tenantId = request.user?.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Tenant authentication is required');
    }

    return requestContext.run(
      { ...requestContext.get(), tenantId },
      async () => {
        const entitled =
          await this.planEntitlements.getFeatureModuleEntitlement(
            tenantId,
            requiredModule,
          );
        if (!entitled) {
          throw new ForbiddenException(
            `The ${requiredModule} module is not included in the tenant's active plan`,
          );
        }

        const enabled = await this.featureFlags.evaluate(
          tenantId,
          requiredModule,
        );
        if (!enabled) {
          throw new ForbiddenException(
            `The ${requiredModule} module is currently disabled for this tenant`,
          );
        }

        return true;
      },
    );
  }
}
