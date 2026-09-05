import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AlertingService } from './alerting.service';

@Module({
  imports: [ConfigModule],
  providers: [AlertingService],
  exports: [AlertingService],
})
export class AlertingModule {}
