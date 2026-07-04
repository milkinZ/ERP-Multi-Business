import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageService } from './storage.service';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { MinioStorageProvider } from './providers/minio-storage.provider';
import { R2StorageProvider } from './providers/r2-storage.provider';
import { StorageController } from './storage.controller';

@Module({
  imports: [ConfigModule],
  providers: [
    StorageService,
    LocalStorageProvider,
    S3StorageProvider,
    MinioStorageProvider,
    R2StorageProvider,
  ],
  controllers: [StorageController],
  exports: [StorageService],
})
export class StorageModule {}
