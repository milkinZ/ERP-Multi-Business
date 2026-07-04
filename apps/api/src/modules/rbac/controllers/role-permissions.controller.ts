import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PermissionGuard } from '../permission.guard';
import { Permissions } from '../../../common/decorator/permissions.decorator';
import { PERMISSIONS } from '../permissions';
import { CurrentUser } from '../../../common/decorator/current-user.decorator';
import type { JwtUser } from '../../../common/interfaces/jwt-user.interface';
import { RolePermissionsDto } from '../dto/role-permissions.dto';
import { RolePermissionsService } from '../services/role-permissions.service';

@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class RolePermissionsController {
  constructor(
    private readonly rolePermissionsService: RolePermissionsService,
  ) {}

  @Get(':id/permissions')
  @Permissions(PERMISSIONS.ROLE_READ)
  getPermissions(@Param('id') roleId: string, @CurrentUser() user: JwtUser) {
    return this.rolePermissionsService.getRolePermissions(
      user.tenantId,
      roleId,
    );
  }

  @Put(':id/permissions')
  @Permissions(PERMISSIONS.ROLE_UPDATE)
  putPermissions(
    @Param('id') roleId: string,
    @Body() dto: RolePermissionsDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.rolePermissionsService.setRolePermissions(
      user.tenantId,
      roleId,
      dto.permissionCodes,
    );
  }
}
