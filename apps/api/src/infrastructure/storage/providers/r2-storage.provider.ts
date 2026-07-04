import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  StorageProvider,
  StorageUploadOptions,
  StorageUploadResult,
  StorageDownloadResult,
} from './storage.provider.interface';

@Injectable()
export class R2StorageProvider implements StorageProvider {
  private readonly logger = new Logger(R2StorageProvider.name);

  constructor(private readonly configService: ConfigService) {}

  private getBucket(): string {
    return this.configService.get<string>('R2_BUCKET') || 'r2-bucket';
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
      provider: 'r2',
      tenantId: options.tenantId,
      outletId: options.outletId,
      createdAt: new Date().toISOString(),
      publicUrl: `r2://${this.getBucket()}/${path}`,
    });
  }

  download(path: string): Promise<StorageDownloadResult> {
    void path;
    return Promise.reject(
      new Error('R2 download not available in placeholder provider'),
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
    return `r2://${this.getBucket()}/${path}`;
  }

  listFiles(folder: string): Promise<StorageUploadResult[]> {
    void folder;
    return Promise.resolve([]);
  }

  generateSignedUrl(path: string, expiresInSeconds = 900): Promise<string> {
    return Promise.resolve(
      `r2-signed://${this.getBucket()}/${path}?exp=${expiresInSeconds}`,
    );
  }
}
