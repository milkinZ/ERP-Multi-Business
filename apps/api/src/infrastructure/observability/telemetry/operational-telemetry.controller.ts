import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { PlatformJwtAuthGuard } from '../../../modules/auth/platform-jwt-auth.guard';
import { PermissionGuard } from '../../../modules/rbac/permission.guard';
import { PERMISSIONS } from '../../../modules/rbac/permissions';
import { Permissions } from '../../../common/decorator/permissions.decorator';
import { OperationalTelemetryQueryDto } from './dto/operational-telemetry-query.dto';
import { OperationalTelemetryService } from './operational-telemetry.service';
import { PlatformSchedulerExecutionService } from '../../scheduler/platform-scheduler-execution.service';
import { PlatformSchedulerExecutionQueryDto } from '../../scheduler/platform-scheduler-execution-query.dto';
import { QueueMonitorService } from '../queue-monitor/queue-monitor.service';

@Controller('super-admin/operational')
@UseGuards(PlatformJwtAuthGuard, PermissionGuard)
export class OperationalTelemetryController {
  constructor(
    private readonly telemetry: OperationalTelemetryService,
    private readonly schedulerExecutions: PlatformSchedulerExecutionService,
    private readonly queueMonitor: QueueMonitorService,
  ) {}

  @Get('telemetry')
  @Permissions(PERMISSIONS.SUPER_ADMIN_READ)
  getTelemetry(@Query() query: OperationalTelemetryQueryDto) {
    return this.telemetry.getHistoricalTelemetry(query);
  }

  @Get('scheduler-runs')
  @Permissions(PERMISSIONS.SUPER_ADMIN_READ)
  getSchedulerRuns(@Query() query: PlatformSchedulerExecutionQueryDto) {
    return this.schedulerExecutions.list(query);
  }

  @Get('failed-jobs')
  @Permissions(PERMISSIONS.SUPER_ADMIN_READ)
  getFailedJobs() {
    return this.queueMonitor.getFailedJobSummaries();
  }
}
