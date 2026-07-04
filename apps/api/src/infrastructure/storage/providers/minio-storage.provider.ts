import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  StorageProvider,
  StorageUploadOptions,
  StorageUploadResult,
  StorageDownloadResult,
} from './storage.provider.interface';

@Injectable()
export class MinioStorageProvider implements StorageProvider {
  private readonly logger = new Logger(MinioStorageProvider.name);

  constructor(private readonly configService: ConfigService) {}

  private getBucket(): string {
    return this.configService.get<string>('MINIO_BUCKET') || 'minio-bucket';
  }

  upload(options: StorageUploadOptions): Promise<StorageUploadResult> {
    const timestamp = Date.now();
    const sanitized = options.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueFilename = `${timestamp}-${sanitized}`;
    const path = `${options.folder || 'general'}/${uniqueFilename}`;

    return Promise.resolve({
      id: path,
      path,
      filename: uniqueFilename,
      originalName: options.originalName,
      mimeType: options.contentType,
      size: options.buffer?.length || 0,
      provider: 'minio',
      tenantId: options.tenantId,
      outletId: options.outletId,
      createdAt: new Date().toISOString(),
      publicUrl: `minio://${this.getBucket()}/${path}`,
    });
  }

  download(path: string): Promise<StorageDownloadResult> {
    void path;
    return Promise.reject(
      new Error('MinIO download not available in placeholder provider'),
    );
  }

  delete(path: string): Promise<void> {
    void path;
    return Promise.resolve();
  }

  exists(path: string): Promise<boolean> {
    void path;
    return Promise.resolve(false);
  }

  getUrl(path: string): string {
    return `minio://${this.getBucket()}/${path}`;
  }

  listFiles(folder: string): Promise<StorageUploadResult[]> {
    void folder;
    return Promise.resolve([]);
  }

  generateSignedUrl(path: string, expiresInSeconds = 900): Promise<string> {
    return Promise.resolve(
      `minio-signed://${this.getBucket()}/${path}?exp=${expiresInSeconds}`,
    );
  }
}
