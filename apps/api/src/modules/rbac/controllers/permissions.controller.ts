import { Controller, Get, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PermissionGuard } from '../permission.guard';
import { Permissions } from '../../../common/decorator/permissions.decorator';
import { PERMISSIONS } from '../permissions';

import { PermissionsService } from '../services/permissions.service';

@Controller('permissions')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PermissionController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @Permissions(PERMISSIONS.PERMISSION_READ)
  getAll() {
    // Pagination/search/sort can be added later; Phase 8.1 only requires existence.

    return this.permissionsService.getAll();
  }
}
