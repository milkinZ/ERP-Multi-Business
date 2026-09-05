import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../../modules/auth/jwt-auth.guard';
import { PermissionGuard } from '../../../modules/rbac/permission.guard';
import { Permissions } from '../../../common/decorator/permissions.decorator';
import { PERMISSIONS } from '../../../modules/rbac/permissions';

import { QueueMonitorService } from './queue-monitor.service';

@ApiTags('admin/queues')
@ApiBearerAuth()
@Controller('admin/queues')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class QueueMonitorController {
  constructor(private readonly queueMonitor: QueueMonitorService) {}

  @Get()
  @Permissions(PERMISSIONS.SUPER_ADMIN_READ)
  async listQueues() {
    const queues = await this.queueMonitor.getQueueSnapshots();
    return {
      success: true,
      message: 'Queue snapshots retrieved',
      data: queues,
    };
  }

  @Get(':name')
  @Permissions(PERMISSIONS.SUPER_ADMIN_READ)
  async getQueue(@Param('name') name: string) {
    const snapshot = await this.queueMonitor.getQueueSnapshot(
      name as Parameters<typeof this.queueMonitor.getQueueSnapshot>[0],
    );
    return {
      success: true,
      message: snapshot ? 'Queue snapshot retrieved' : 'Queue not found',
      data: snapshot,
    };
  }
}
