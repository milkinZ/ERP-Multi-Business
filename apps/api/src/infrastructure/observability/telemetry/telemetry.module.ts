import { Module } from '@nestjs/common';

import { OperationalTelemetryController } from './operational-telemetry.controller';
import { OperationalTelemetryService } from './operational-telemetry.service';
import { PlatformSchedulerHistoryModule } from '../../scheduler/platform-scheduler-history.module';
import { QueueMonitorModule } from '../queue-monitor/queue-monitor.module';

@Module({
  imports: [PlatformSchedulerHistoryModule, QueueMonitorModule],
  controllers: [OperationalTelemetryController],
  providers: [OperationalTelemetryService],
  exports: [OperationalTelemetryService],
})
export class TelemetryModule {}
