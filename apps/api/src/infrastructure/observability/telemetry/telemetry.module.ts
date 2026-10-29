import { Module } from '@nestjs/common';

import { OperationalTelemetryController } from './operational-telemetry.controller';
import { OperationalTelemetryService } from './operational-telemetry.service';

@Module({
  controllers: [OperationalTelemetryController],
  providers: [OperationalTelemetryService],
  exports: [OperationalTelemetryService],
})
export class TelemetryModule {}
