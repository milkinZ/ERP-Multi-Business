import { Module } from '@nestjs/common';

import { StorageService } from '../../infrastructure/storage/storage.service';
import { StorageUploadService } from './storage-upload.service';

@Module({
  providers: [StorageUploadService, StorageService],
  exports: [StorageUploadService],
})
export class StorageModule {}
