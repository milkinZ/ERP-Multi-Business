import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpenTelemetryService } from './opentelemetry.service';

@Module({
  imports: [ConfigModule],
  providers: [OpenTelemetryService],
  exports: [OpenTelemetryService],
})
export class OpenTelemetryModule {}

export default OpenTelemetryModule;
