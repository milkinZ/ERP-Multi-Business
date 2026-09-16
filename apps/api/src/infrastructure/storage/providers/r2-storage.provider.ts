import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3CompatibleStorageProvider } from './s3-compatible-storage.provider';

@Injectable()
export class R2StorageProvider extends S3CompatibleStorageProvider {
  constructor(config: ConfigService) {
    super(config, 'r2', {
      bucket: config.get<string>('R2_BUCKET') ?? 'r2-bucket',
      endpoint: config.get<string>('R2_ENDPOINT'),
      region: config.get<string>('R2_REGION') ?? 'auto',
    });
  }
}
