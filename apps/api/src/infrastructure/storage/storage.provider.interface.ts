export type StorageProviderType = 'local' | 's3' | 'minio' | 'r2';

export interface StorageUploadOptions {
  filename: string; // sanitized filename
  originalName?: string; // original client filename
  buffer: Buffer;
  contentType?: string;
  folder?: string; // logical folder, e.g. 'products', 'avatars'
  tenantId?: string;
  outletId?: string;
  permanent?: boolean; // temporary vs permanent
}

export interface StorageFileMetadata {
  id: string;
  path: string;
  filename: string;
  originalName?: string;
  mimeType?: string;
  size: number;
  provider: string;
  tenantId?: string;
  outletId?: string;
  createdAt: string;
  publicUrl?: string;
}

export interface StorageUploadResult extends StorageFileMetadata {
  signedUrl?: string;
}

export interface StorageDownloadResult {
  buffer: Buffer;
  contentType?: string;
  size: number;
}

export interface StorageProvider {
  /**
   * Upload a file to storage
   */
  upload(options: StorageUploadOptions): Promise<StorageUploadResult>;

  /**
   * Download a file from storage
   */
  download(path: string): Promise<StorageDownloadResult>;

  /**
   * Delete a file from storage
   */
  delete(path: string): Promise<void>;

  /**
   * Check if file exists
   */
  exists(path: string): Promise<boolean>;

  /**
   * Get file URL
   */
  getUrl(path: string): string;

  /**
   * List files in folder
   */
  listFiles(folder: string): Promise<StorageUploadResult[]>;

  /**
   * Generate a signed URL (if supported). Return a URL string.
   */
  generateSignedUrl?(
    path: string,
    expiresInSeconds?: number,
  ): Promise<string> | string;
}
