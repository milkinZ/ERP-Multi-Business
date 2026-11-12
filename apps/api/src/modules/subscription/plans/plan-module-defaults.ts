import { PlanType } from '../domain/subscription.aggregate';
import type { FeatureModuleKey } from './feature-module-keys';

export const DEFAULT_PLAN_MODULE_KEYS: Record<
  PlanType,
  readonly FeatureModuleKey[]
> = {
  [PlanType.FREE]: [],
  [PlanType.STARTER]: ['INVENTORY'],
  [PlanType.BUSINESS]: ['INVENTORY', 'PROCUREMENT', 'ANALYTICS'],
  [PlanType.ENTERPRISE]: ['INVENTORY', 'PROCUREMENT', 'FINANCE', 'ANALYTICS'],
};
