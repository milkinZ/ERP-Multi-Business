export const FEATURE_MODULE_KEYS = [
  'INVENTORY',
  'PROCUREMENT',
  'FINANCE',
  'ANALYTICS',
] as const;

export type FeatureModuleKey = (typeof FEATURE_MODULE_KEYS)[number];
