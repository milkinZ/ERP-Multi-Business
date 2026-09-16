import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3CompatibleStorageProvider } from './s3-compatible-storage.provider';

@Injectable()
export class S3StorageProvider extends S3CompatibleStorageProvider {
  constructor(config: ConfigService) {
    super(config, 's3', {
      bucket: config.get<string>('S3_BUCKET') ?? 's3-bucket',
      endpoint: config.get<string>('S3_ENDPOINT'),
      region: config.get<string>('S3_REGION'),
    });
  }
}
