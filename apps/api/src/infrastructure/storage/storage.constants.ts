import type { StorageProviderType } from './storage.provider.interface';

export const STORAGE_PROVIDER_TOKEN = 'STORAGE_PROVIDER';

export const STORAGE_PROVIDER_TYPES: StorageProviderType[] = [
  'local',
  's3',
  'minio',
  'r2',
];
