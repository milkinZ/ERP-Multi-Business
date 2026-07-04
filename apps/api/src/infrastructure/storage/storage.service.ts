import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { MinioStorageProvider } from './providers/minio-storage.provider';
import { R2StorageProvider } from './providers/r2-storage.provider';
import {
  StorageProvider,
  StorageUploadOptions,
  StorageUploadResult,
  StorageDownloadResult,
  StorageFileMetadata,
  StorageProviderType,
} from './storage.provider.interface';

@Injectable()
export class StorageService {
  private provider!: StorageProvider;
  private storageType: StorageProviderType;
  private readonly logger = new Logger(StorageService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly localProvider: LocalStorageProvider,
    private readonly s3Provider: S3StorageProvider,
    private readonly minioProvider: MinioStorageProvider,
    private readonly r2Provider: R2StorageProvider,
  ) {
    this.storageType = (this.configService.get<string>('STORAGE_TYPE') ||
      'local') as StorageProviderType;
    this.initializeProvider();
  }

  private initializeProvider() {
    const providers: Record<StorageProviderType, StorageProvider> = {
      local: this.localProvider,
      s3: this.s3Provider,
      minio: this.minioProvider,
      r2: this.r2Provider,
    };

    this.provider = providers[this.storageType] ?? this.localProvider;
    this.logger.log(`Initialized storage provider: ${this.storageType}`);
  }

  /**
   * Upload file
   */
  async upload(options: StorageUploadOptions): Promise<StorageUploadResult> {
    // enforce tenant isolation and validation should be done before calling
    return this.provider.upload(options);
  }

  /**
   * Download file
   */
  async download(path: string): Promise<StorageDownloadResult> {
    return this.provider.download(path);
  }

  /**
   * Delete file
   */
  async delete(path: string): Promise<void> {
    return this.provider.delete(path);
  }

  /**
   * Check if file exists
   */
  async exists(path: string): Promise<boolean> {
    return this.provider.exists(path);
  }

  /**
   * Get file URL
   */
  getUrl(path: string): string {
    return this.provider.getUrl(path);
  }

  /**
   * List files in folder
   */
  async listFiles(folder: string): Promise<StorageFileMetadata[]> {
    return this.provider.listFiles(folder);
  }

  async generateSignedUrl(
    path: string,
    expiresInSeconds?: number,
  ): Promise<string | undefined> {
    if (typeof this.provider.generateSignedUrl === 'function') {
      return this.provider.generateSignedUrl(path, expiresInSeconds);
    }
    // For local, return an internal route
    if (this.storageType === 'local') {
      return `${this.localProvider.getUrl(path)}?internal_signed=1`;
    }
    return undefined;
  }

  /**
   * Get current storage type
   */
  getStorageType(): StorageProviderType {
    return this.storageType;
  }
}
