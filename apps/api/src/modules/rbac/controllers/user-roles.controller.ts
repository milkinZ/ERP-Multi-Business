import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PermissionGuard } from '../permission.guard';
import { Permissions } from '../../../common/decorator/permissions.decorator';
import { PERMISSIONS } from '../permissions';
import { CurrentUser } from '../../../common/decorator/current-user.decorator';
import type { JwtUser } from '../../../common/interfaces/jwt-user.interface';
import { UserRolesDto } from '../dto/user-roles.dto';
import { UserRolesService } from '../services/user-roles.service';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class UserRolesController {
  constructor(private readonly userRolesService: UserRolesService) {}

  @Get(':id/roles')
  @Permissions(PERMISSIONS.USER_ROLE_MANAGE)
  getUserRoles(@Param('id') userId: string, @CurrentUser() user: JwtUser) {
    return this.userRolesService.getUserRoles(user.tenantId, userId);
  }

  @Put(':id/roles')
  @Permissions(PERMISSIONS.USER_ROLE_MANAGE)
  putUserRoles(
    @Param('id') userId: string,
    @Body() dto: UserRolesDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.userRolesService.setUserRoles(
      user.tenantId,
      userId,
      dto.roleIds,
    );
  }
}
