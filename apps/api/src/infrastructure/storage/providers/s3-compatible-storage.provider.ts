import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  StorageDownloadResult,
  StorageProvider,
  StorageProviderType,
  StorageUploadOptions,
  StorageUploadResult,
} from './storage.provider.interface';

export abstract class S3CompatibleStorageProvider implements StorageProvider {
  protected readonly logger = new Logger(S3CompatibleStorageProvider.name);
  protected readonly client: S3Client;
  protected readonly bucket: string;
  protected readonly provider: StorageProviderType;
  private readonly publicEndpoint?: string;

  protected constructor(
    protected readonly config: ConfigService,
    provider: StorageProviderType,
    options: { bucket: string; endpoint?: string; region?: string },
  ) {
    this.provider = provider;
    this.bucket = options.bucket;
    this.publicEndpoint = config.get<string>(
      `${provider.toUpperCase()}_PUBLIC_URL`,
    );
    this.client = new S3Client({
      region: options.region ?? config.get<string>('S3_REGION') ?? 'us-east-1',
      endpoint: options.endpoint,
      forcePathStyle: provider === 'minio',
      credentials:
        config.get<string>(`${provider.toUpperCase()}_ACCESS_KEY`) ||
        config.get<string>('S3_ACCESS_KEY')
          ? {
              accessKeyId:
                config.get<string>(`${provider.toUpperCase()}_ACCESS_KEY`) ??
                config.get<string>('S3_ACCESS_KEY')!,
              secretAccessKey:
                config.get<string>(`${provider.toUpperCase()}_SECRET_KEY`) ??
                config.get<string>('S3_SECRET_KEY')!,
            }
          : undefined,
    });
  }

  async upload(options: StorageUploadOptions): Promise<StorageUploadResult> {
    const key = this.key(options.folder, options.filename);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: options.buffer,
        ContentType: options.contentType,
        Metadata: {
          tenantId: options.tenantId ?? '',
          outletId: options.outletId ?? '',
          originalName: options.originalName ?? '',
        },
      }),
    );
    return {
      id: key,
      path: key,
      filename: key.split('/').pop() ?? key,
      originalName: options.originalName,
      mimeType: options.contentType,
      size: options.buffer.length,
      provider: this.provider,
      tenantId: options.tenantId,
      outletId: options.outletId,
      createdAt: new Date().toISOString(),
      publicUrl: this.getUrl(key),
    };
  }

  async download(key: string): Promise<StorageDownloadResult> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!response.Body) throw new Error(`Object not found: ${key}`);
    const bytes = await response.Body.transformToByteArray();
    return {
      buffer: Buffer.from(bytes),
      size: bytes.byteLength,
      contentType: response.ContentType,
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === 'NotFound') return false;
      throw error;
    }
  }

  getUrl(key: string): string {
    if (this.publicEndpoint)
      return `${this.publicEndpoint.replace(/\/$/, '')}/${this.bucket}/${key}`;
    return `s3://${this.bucket}/${key}`;
  }

  async listFiles(folder: string): Promise<StorageUploadResult[]> {
    const response = await this.client.send(
      new ListObjectsV2Command({ Bucket: this.bucket, Prefix: folder }),
    );
    return (response.Contents ?? []).map((object) =>
      this.metadata(object.Key ?? '', object.Size ?? 0, object.LastModified),
    );
  }

  async generateSignedUrl(
    key: string,
    expiresInSeconds = 900,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  protected key(folder: string | undefined, filename: string): string {
    return [folder?.replace(/^\/+|\/+$/g, ''), filename.replace(/^\/+/, '')]
      .filter(Boolean)
      .join('/');
  }

  private metadata(
    key: string,
    size: number,
    createdAt?: Date,
  ): StorageUploadResult {
    return {
      id: key,
      path: key,
      filename: key.split('/').pop() ?? key,
      size,
      provider: this.provider,
      createdAt: (createdAt ?? new Date()).toISOString(),
      publicUrl: this.getUrl(key),
    };
  }
}
