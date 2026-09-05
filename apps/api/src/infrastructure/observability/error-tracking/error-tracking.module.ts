import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ErrorTrackingService } from './error-tracking.service';

@Module({
  imports: [ConfigModule],
  providers: [ErrorTrackingService],
  exports: [ErrorTrackingService],
})
export class ErrorTrackingModule {}
