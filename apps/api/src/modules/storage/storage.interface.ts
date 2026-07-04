import type { StorageProviderType } from '../../infrastructure/storage/storage.provider.interface';

export type UploadId = string;

export type StorageMetadata = {
  id: UploadId;
  filename: string;
  mimeType?: string;
  size: number;
  provider: StorageProviderType;
  tenantId: string;
  outletId?: string | null;
  createdAt: Date;
  publicUrl: string;
  signedUrl: string;
};
