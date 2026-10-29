import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { PlatformJwtAuthGuard } from '../../../modules/auth/platform-jwt-auth.guard';
import { PermissionGuard } from '../../../modules/rbac/permission.guard';
import { PERMISSIONS } from '../../../modules/rbac/permissions';
import { Permissions } from '../../../common/decorator/permissions.decorator';
import { OperationalTelemetryQueryDto } from './dto/operational-telemetry-query.dto';
import { OperationalTelemetryService } from './operational-telemetry.service';

@Controller('super-admin/operational')
@UseGuards(PlatformJwtAuthGuard, PermissionGuard)
export class OperationalTelemetryController {
  constructor(private readonly telemetry: OperationalTelemetryService) {}

  @Get('telemetry')
  @Permissions(PERMISSIONS.SUPER_ADMIN_READ)
  getTelemetry(@Query() query: OperationalTelemetryQueryDto) {
    return this.telemetry.getHistoricalTelemetry(query);
  }
}
