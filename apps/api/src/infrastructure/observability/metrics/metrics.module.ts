import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';

@Module({
  imports: [ConfigModule],
  providers: [MetricsService],
  controllers: [MetricsController],
  exports: [MetricsService],
})
export class MetricsModule {}
