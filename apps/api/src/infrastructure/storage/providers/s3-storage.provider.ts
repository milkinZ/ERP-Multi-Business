import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  StorageProvider,
  StorageUploadOptions,
  StorageUploadResult,
  StorageDownloadResult,
} from './storage.provider.interface';

@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly logger = new Logger(S3StorageProvider.name);
  // S3 implementation will be added in future
  // For now, this is a placeholder

  constructor(private readonly configService: ConfigService) {}

  upload(options: StorageUploadOptions): Promise<StorageUploadResult> {
    // Minimal compatible placeholder: store metadata only (no remote upload)
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
      provider: 's3',
      tenantId: options.tenantId,
      outletId: options.outletId,
      createdAt: new Date().toISOString(),
      publicUrl: `s3://${this.configService.get<string>('S3_BUCKET')}/${path}`,
    });
  }

  download(path: string): Promise<StorageDownloadResult> {
    // Not actually implemented for remote; return error-like structure
    void path;
    return Promise.reject(
      new Error('S3 download not available in placeholder provider'),
    );
  }

  delete(path: string): Promise<void> {
    // No-op placeholder
    void path;
    return Promise.resolve();
  }

  exists(path: string): Promise<boolean> {
    // Placeholder assumes non-existence
    void path;
    return Promise.resolve(false);
  }

  getUrl(path: string): string {
    return `s3://${this.configService.get<string>('S3_BUCKET')}/${path}`;
  }

  listFiles(folder: string): Promise<StorageUploadResult[]> {
    void folder;
    return Promise.resolve([]);
  }

  generateSignedUrl(path: string, expiresInSeconds = 900): Promise<string> {
    return Promise.resolve(
      `s3-signed://${this.configService.get<string>('S3_BUCKET')}/${path}?exp=${expiresInSeconds}`,
    );
  }
}
