import { SetMetadata } from '@nestjs/common';
import type { FeatureModuleKey } from './feature-module-keys';

export const FEATURE_MODULE_METADATA = 'requiredFeatureModule';

export const RequireFeatureModule = (key: FeatureModuleKey) =>
  SetMetadata(FEATURE_MODULE_METADATA, key);
