import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3CompatibleStorageProvider } from './s3-compatible-storage.provider';

@Injectable()
export class MinioStorageProvider extends S3CompatibleStorageProvider {
  constructor(config: ConfigService) {
    super(config, 'minio', {
      bucket: config.get<string>('MINIO_BUCKET') ?? 'minio-bucket',
      endpoint: config.get<string>('MINIO_ENDPOINT') ?? 'http://127.0.0.1:9000',
      region: config.get<string>('MINIO_REGION') ?? 'us-east-1',
    });
  }
}
